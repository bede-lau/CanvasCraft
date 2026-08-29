"""CanvasCraft's small, explicit CLIP embedding service for a Nosana GPU job."""

from __future__ import annotations

import base64
import io
import ipaddress
import os
import socket
from contextlib import asynccontextmanager
from typing import Annotated
from urllib.parse import urlparse

import httpx
import torch
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl, model_validator
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

MODEL_ID = os.getenv("CLIP_MODEL_ID", "openai/clip-vit-base-patch32")
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(6 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", str(16_000_000)))
ALLOW_REMOTE_IMAGES = os.getenv("ALLOW_REMOTE_IMAGES", "false").lower() == "true"
API_KEY = os.getenv("NOSANA_API_KEY")
model: CLIPModel | None = None
processor: CLIPProcessor | None = None


class ImageInput(BaseModel):
    image_base64: str | None = None
    image_url: HttpUrl | None = None

    @model_validator(mode="after")
    def has_one_source(self) -> "ImageInput":
        if not self.image_base64 and not self.image_url:
            raise ValueError("Provide image_base64 or image_url.")
        return self


class EmbedResponse(BaseModel):
    model: str
    dimensions: int
    embedding: list[float]


class MatchCandidate(BaseModel):
    id: str = Field(min_length=1)
    image: ImageInput


class MatchRequest(BaseModel):
    query: ImageInput
    candidates: list[MatchCandidate] = Field(min_length=1, max_length=12)


class MatchResult(BaseModel):
    id: str
    score: float


class MatchResponse(BaseModel):
    model: str
    matches: list[MatchResult]


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, processor
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    model = CLIPModel.from_pretrained(MODEL_ID)
    model.eval()
    yield
    model = None
    processor = None


app = FastAPI(
    title="CanvasCraft Nosana CLIP",
    version="0.1.0",
    lifespan=lifespan,
)


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key.")


def reject_private_target(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status_code=422, detail="Only absolute http(s) image URLs are allowed.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as error:
        raise HTTPException(status_code=422, detail="Image host could not be resolved.") from error
    for address in addresses:
        host = ipaddress.ip_address(address[4][0])
        if not host.is_global:
            raise HTTPException(status_code=422, detail="Private, loopback, and local image hosts are not allowed.")


def decode_image(raw: bytes) -> Image.Image:
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Image exceeds the {MAX_IMAGE_BYTES} byte limit.")
    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        decoded = Image.open(io.BytesIO(raw)).convert("RGB")
        if decoded.width * decoded.height > MAX_IMAGE_PIXELS:
            raise HTTPException(status_code=413, detail=f"Image exceeds the {MAX_IMAGE_PIXELS} pixel limit.")
        return decoded
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=422, detail=f"Unable to decode image: {error}") from error


async def load_image(source: ImageInput) -> Image.Image:
    try:
        if source.image_base64:
            encoded = source.image_base64.split(",", 1)[-1]
            if len(encoded) > MAX_IMAGE_BYTES * 2:
                raise HTTPException(status_code=413, detail="Base64 image is too large.")
            raw = base64.b64decode(encoded, validate=True)
        else:
            assert source.image_url is not None
            if not ALLOW_REMOTE_IMAGES:
                raise HTTPException(status_code=422, detail="Remote image URLs are disabled for this deployment.")
            reject_private_target(str(source.image_url))
            async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
                response = await client.get(str(source.image_url))
                response.raise_for_status()
                content_length = response.headers.get("content-length")
                if content_length and int(content_length) > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=413, detail=f"Image exceeds the {MAX_IMAGE_BYTES} byte limit.")
                raw = await response.aread()
        return decode_image(raw)
    except HTTPException:
        raise
    except Exception as error:  # pragma: no cover - model service integration path
        raise HTTPException(status_code=422, detail=f"Unable to read image: {error}") from error


def embed_image(image: Image.Image) -> list[float]:
    if model is None or processor is None:
        raise HTTPException(status_code=503, detail="CLIP model is still loading.")

    inputs = processor(images=image, return_tensors="pt")
    with torch.inference_mode():
        features = model.get_image_features(**inputs)
        normalised = torch.nn.functional.normalize(features, p=2, dim=-1)[0]
    return [float(value) for value in normalised.cpu().tolist()]


@app.get("/health")
def health() -> dict[str, str | bool | int]:
    return {
        "ok": model is not None and processor is not None,
        "model": MODEL_ID,
        "remoteImagesEnabled": ALLOW_REMOTE_IMAGES,
        "maxImageBytes": MAX_IMAGE_BYTES,
    }


@app.post("/embed", response_model=EmbedResponse)
async def embed(
    payload: ImageInput,
    _: Annotated[None, Depends(require_api_key)],
) -> EmbedResponse:
    embedding = embed_image(await load_image(payload))
    return EmbedResponse(model=MODEL_ID, dimensions=len(embedding), embedding=embedding)


@app.post("/match", response_model=MatchResponse)
async def match(
    payload: MatchRequest,
    _: Annotated[None, Depends(require_api_key)],
) -> MatchResponse:
    query = torch.tensor(embed_image(await load_image(payload.query)))
    results: list[MatchResult] = []

    for candidate in payload.candidates:
        vector = torch.tensor(embed_image(await load_image(candidate.image)))
        score = float(torch.dot(query, vector).item())
        results.append(MatchResult(id=candidate.id, score=round(max(0.0, min(1.0, score)), 6)))

    return MatchResponse(model=MODEL_ID, matches=sorted(results, key=lambda item: item.score, reverse=True))

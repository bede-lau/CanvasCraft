FROM node:22-bookworm-slim

ENV PREVIEW_PORT=4173 \
    PORT=4173

WORKDIR /workspace

COPY packages/branch-template/package.json ./package.json
RUN npm install --include=dev --ignore-scripts

COPY packages/branch-template/ ./

EXPOSE 4173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "4173"]

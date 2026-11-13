FROM node:20-alpine

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build && chown -R node:node /app/.next

ENV PORT=3000
EXPOSE 3000
USER node
CMD ["npm", "start"]

FROM node:20-slim

WORKDIR /app

# Build args for environment variables
ARG SECRET_TOKEN
ARG DATABASE_URL
ARG WS_PORT=4001

# Set environment variables from build args
ENV SECRET_TOKEN=${SECRET_TOKEN}
ENV DATABASE_URL=${DATABASE_URL}
ENV WS_PORT=${WS_PORT}

# Copy package manifest and install dependencies
COPY package.json ./
RUN yarn install

# Copy application source
COPY server.js ./

CMD ["node", "index.js"]

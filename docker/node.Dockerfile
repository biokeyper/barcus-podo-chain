# docker/node.Dockerfile
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy everything from chain (including local node_modules)
COPY chain ./chain

# Build using your local modules
WORKDIR /app/chain
RUN npm run build

# Start the node
CMD ["npm", "run", "start"]

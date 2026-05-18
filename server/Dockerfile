# Use the official Node.js 20 Alpine image for a small, secure footprint
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install production dependencies only (ignores devDependencies)
RUN npm ci --only=production

# Copy the remaining server code
COPY . .

# Expose the port the Express app will listen on
EXPOSE 8080

# Switch to standard node user to avoid running the container as root
USER node

# Start the application
CMD [ "npm", "start" ]

FROM node:22-bullseye AS builder

WORKDIR /app

# Copy application files
COPY ./backend ./backend
COPY ./views ./views
COPY ./package*.json ./

# Set npm registry (optional but useful in some contexts)
RUN npm config set registry https://registry.npmjs.org/

# Install root dependencies
RUN npm install

# Run the custom script to install backend dependencies
RUN npm run install-backend

# Expose port
EXPOSE 3333

# Start the application
CMD ["npm", "run", "start"]

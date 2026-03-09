FROM node:22-alpine

WORKDIR /app

# Copy all files
COPY . .

# Build args for Vite (needed at build time)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SERVER_URL

# Install all dependencies
RUN npm install --legacy-peer-deps
RUN cd client && npm install --legacy-peer-deps
RUN cd server && npm install --legacy-peer-deps

# Build client with env vars
RUN cd client && VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SERVER_URL=$VITE_SERVER_URL \
    npm run build

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]

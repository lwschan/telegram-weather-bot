# First stage
FROM node:20-alpine AS build
ENV NODE_ENV=development
WORKDIR /source
COPY . .
RUN corepack enable
RUN yarn set version stable
RUN yarn install
RUN yarn build
# Reduce the size of node_modules to only include production dependencies
RUN rm -rf node_modules
RUN yarn workspaces focus -A --production

# Second stage
FROM node:20-alpine
WORKDIR /app
COPY --from=build /source/build /source/package.json /app/
COPY --from=build /source/node_modules /app/node_modules
COPY --from=build /source/scripts /app/

CMD [ "sh", "-c", "NODE_ENV=production node --no-warnings --loader ./loader.js index.js" ]

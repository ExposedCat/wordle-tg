FROM denoland/deno:2.8.1

# A real font is needed for the board/keyboard image rendering.
USER root
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV DB_PATH=/data/telewordle.db
ENV ENV=PROD
ENV DEBUG=app:*:warn,app:*:error

COPY deno.json deno.lock ./
COPY src ./src
COPY data ./data
COPY locales ./locales
RUN deno cache --lock=deno.lock src/index.ts

VOLUME /data
CMD ["deno", "task", "start"]

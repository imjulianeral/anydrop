import net from "node:net";

const listenHost = process.env.PG_GATEWAY_LISTEN_HOST ?? "0.0.0.0";
const listenPort = Number(process.env.PG_GATEWAY_PORT ?? 51_214);
const targetHost = process.env.PG_GATEWAY_TARGET_HOST ?? "127.0.0.1";
const targetPort = Number(process.env.PG_GATEWAY_TARGET_PORT ?? 51_214);

const server = net.createServer((client) => {
  const upstream = net.connect({ host: targetHost, port: targetPort });

  const pipe = () => {
    client.pipe(upstream);
    upstream.pipe(client);
  };

  if (upstream.connecting) {
    upstream.once("connect", pipe);
  } else {
    pipe();
  }

  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
});

server.listen(listenPort, listenHost, () => {
  process.stdout.write(
    `pg-gateway ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}\n`
  );
});

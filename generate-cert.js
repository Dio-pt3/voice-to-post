const selfsigned = require("selfsigned");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const certificates = await selfsigned.generate(
    [{ name: "commonName", value: "localhost" }],
    {
      keySize: 2048,
      algorithm: "sha256"
    }
  );

  const folder = path.join(__dirname, "certs");
  fs.mkdirSync(folder, { recursive: true });

  fs.writeFileSync(
    path.join(folder, "localhost-key.pem"),
    certificates.private
  );

  fs.writeFileSync(
    path.join(folder, "localhost-cert.pem"),
    certificates.cert
  );

  console.log("Local HTTPS certificate created.");
}

main().catch(() => {
  console.error("Certificate creation failed.");
  process.exitCode = 1;
});
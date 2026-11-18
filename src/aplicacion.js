const express = require("express");
const cors = require("cors");
const rutasFacturas = require("./rutas/rutasFacturas");
const manejarErrores = require("./intermediarios/manejoErrores");
const { responderExito, responderError } = require("./utilidades/respuestasApi");

const aplicacion = express();

aplicacion.use(cors());
aplicacion.use(express.json({ limit: "1mb" }));
aplicacion.get("/api/salud", (_solicitud, respuesta) => {
  responderExito(respuesta, {
    mensaje: "El servicio está disponible.",
    datos: { servicio: "api-control-facturas" },
  });
});
aplicacion.use("/api/facturas", rutasFacturas);
aplicacion.use((_solicitud, respuesta) => {
  responderError(respuesta, {
    estado: 404,
    codigo: "RUTA_NO_ENCONTRADA",
    mensaje: "No encontramos esta dirección. Revisa la ruta e inténtalo de nuevo.",
  });
});
aplicacion.use(manejarErrores);

module.exports = aplicacion;


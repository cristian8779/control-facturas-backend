const express = require("express");
const controladorFacturas = require("../controladores/controladorFacturas");
const { cargaArchivos, validarTipoArchivo } = require("../intermediarios/cargaArchivos");

const rutasFacturas = express.Router();

rutasFacturas.get("/", controladorFacturas.listarFacturas);
rutasFacturas.post("/", controladorFacturas.crearFactura);
rutasFacturas.get("/:idFactura/adjunto", controladorFacturas.obtenerAdjuntoFactura);
rutasFacturas.get("/:idFactura/adjuntos/:idAdjunto", controladorFacturas.obtenerAdjuntoFacturaPorId);
rutasFacturas.post("/:idFactura/adjunto", cargaArchivos.any(), validarTipoArchivo, controladorFacturas.guardarAdjuntoFactura);
rutasFacturas.delete("/:idFactura/adjuntos/:idAdjunto", controladorFacturas.eliminarAdjuntoFactura);
rutasFacturas.get("/:idFactura/pagos/:idPago/comprobante", controladorFacturas.obtenerComprobantePago);
rutasFacturas.post("/:idFactura/pagos/:idPago/comprobante", cargaArchivos.single("archivo"), validarTipoArchivo, controladorFacturas.guardarComprobantePago);
rutasFacturas.post("/:idFactura/pagos", controladorFacturas.registrarPago);
rutasFacturas.delete("/:idFactura/pagos/:idPago", controladorFacturas.eliminarPago);
rutasFacturas.get("/:idFactura", controladorFacturas.obtenerFactura);
rutasFacturas.put("/:idFactura", controladorFacturas.actualizarFactura);
rutasFacturas.delete("/:idFactura", controladorFacturas.eliminarFactura);

module.exports = rutasFacturas;

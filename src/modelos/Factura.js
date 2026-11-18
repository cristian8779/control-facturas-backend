const mongoose = require("mongoose");

function esFechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const fechaConvertida = new Date(fecha + "T00:00:00.000Z");
  return !Number.isNaN(fechaConvertida.valueOf()) &&
    fechaConvertida.toISOString().slice(0, 10) === fecha;
}

const esquemaAdjunto = new mongoose.Schema({
  nombreArchivo: { type: String, required: true },
  tipoContenido: {
    type: String,
    enum: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    required: true,
  },
  tamano: { type: Number, required: true },
  idPublico: { type: String, required: true },
  formato: { type: String, required: true },
  tipoRecurso: { type: String, enum: ["image"], default: "image" },
}, { _id: false });

const esquemaPago = new mongoose.Schema({
  valor: {
    type: Number,
    required: true,
    min: 1,
    validate: { validator: Number.isSafeInteger, message: "El abono debe ser un número entero de pesos." },
  },
  fechaPago: { type: Date, required: true, default: Date.now },
  metodoPago: {
    type: String,
    enum: ["efectivo", "transferencia", "tarjeta", "otro"],
    default: "otro",
  },
  referencia: { type: String, trim: true, maxlength: 120, default: "" },
  observaciones: { type: String, trim: true, maxlength: 500, default: "" },
  comprobante: { type: esquemaAdjunto, default: null },
}, { timestamps: { createdAt: "fechaRegistro", updatedAt: false } });

const esquemaFactura = new mongoose.Schema({
  comercio: { type: String, required: true, trim: true, maxlength: 120 },
  valorTotal: {
    type: Number,
    required: true,
    min: 1,
    validate: { validator: Number.isSafeInteger, message: "El valor debe ser un número entero de pesos." },
  },
  fechaLlegada: {
    type: String,
    required: true,
    validate: { validator: esFechaValida, message: "La fecha de llegada debe tener formato AAAA-MM-DD." },
  },
  fechaVencimiento: {
    type: String,
    required: true,
    validate: { validator: esFechaValida, message: "La fecha de vencimiento debe tener formato AAAA-MM-DD." },
  },
  numeroFactura: { type: String, trim: true, maxlength: 80, default: "" },
  observaciones: { type: String, trim: true, maxlength: 1000, default: "" },
  // adjuntoFactura se conserva para leer documentos guardados con versiones anteriores.
  adjuntoFactura: { type: esquemaAdjunto, default: null },
  adjuntosFactura: { type: [esquemaAdjunto], default: [] },
  pagos: { type: [esquemaPago], default: [] },
}, {
  timestamps: { createdAt: "fechaCreacion", updatedAt: "fechaActualizacion" },
});

esquemaFactura.index({ fechaVencimiento: 1 });
esquemaFactura.index({ valorTotal: 1 });

module.exports = mongoose.model("Factura", esquemaFactura);

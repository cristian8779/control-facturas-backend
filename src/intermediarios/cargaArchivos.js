const multer = require("multer");
const { responderError } = require("../utilidades/respuestasApi");

const cargaArchivos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
});

function detectarTipoContenido(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function validarTipoArchivo(solicitud, respuesta, continuar) {
  const archivos = solicitud.files?.length
    ? solicitud.files
    : solicitud.file
      ? [solicitud.file]
      : [];
  if (archivos.length === 0) return continuar();

  const tamanoTotal = archivos.reduce((total, archivo) => total + archivo.size, 0);
  if (tamanoTotal > 30 * 1024 * 1024) {
    return responderError(respuesta, {
      estado: 413,
      codigo: "LOTE_ARCHIVOS_DEMASIADO_GRANDE",
      mensaje: "El conjunto de archivos supera 30 MB. Sube menos páginas a la vez.",
    });
  }

  for (const archivo of archivos) {
    const tipoContenido = detectarTipoContenido(archivo.buffer);
    if (!tipoContenido) {
      return responderError(respuesta, {
        estado: 415,
        codigo: "TIPO_ARCHIVO_NO_PERMITIDO",
        mensaje: "No reconocimos uno de los archivos. Usa imágenes JPG, PNG o WEBP, o PDF.",
      });
    }
    // Usa el formato comprobado por el contenido, no el MIME que informe Android.
    archivo.mimetype = tipoContenido;
  }
  return continuar();
}

module.exports = { cargaArchivos, validarTipoArchivo };

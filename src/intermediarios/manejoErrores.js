const { responderError } = require("../utilidades/respuestasApi");

function manejarErrores(fallo, _solicitud, respuesta, _continuar) {
  console.error(fallo);

  if (fallo.name === "ValidationError") {
    const detalles = Object.fromEntries(
      Object.entries(fallo.errors || {}).map(([campo, error]) => [campo, error.message])
    );
    return responderError(respuesta, {
      estado: 400,
      codigo: "DATOS_NO_VALIDOS",
      mensaje: "Revisa los datos marcados y vuelve a intentarlo.",
      detalles,
    });
  }
  if (fallo.name === "CastError") return responderError(respuesta, { estado: 400, codigo: "DATO_NO_VALIDO", mensaje: "Uno de los datos enviados no tiene un formato válido." });
  if (fallo instanceof SyntaxError) return responderError(respuesta, { estado: 400, codigo: "JSON_NO_VALIDO", mensaje: "No pudimos leer la información enviada. Revisa el formato e inténtalo de nuevo." });
  if (fallo.code === 11000) {
    return responderError(respuesta, { estado: 409, codigo: "REGISTRO_DUPLICADO", mensaje: "Ya existe un registro con esos datos." });
  }
  if (fallo.name === "MulterError") {
    const estadoHttp = fallo.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const mensaje = fallo.code === "LIMIT_FILE_SIZE"
      ? "El archivo supera el máximo permitido de 10 MB. Elige uno más pequeño."
      : fallo.code === "LIMIT_FILE_COUNT"
        ? "Puedes adjuntar hasta 3 archivos por envío."
      : "No pudimos procesar el archivo. Vuelve a seleccionarlo e inténtalo de nuevo.";
    return responderError(respuesta, { estado: estadoHttp, codigo: fallo.code === "LIMIT_FILE_SIZE" ? "ARCHIVO_DEMASIADO_GRANDE" : "ARCHIVO_NO_VALIDO", mensaje });
  }
  if (fallo.message && fallo.message.startsWith("Adjunta una imagen")) {
    return responderError(respuesta, { estado: 415, codigo: "TIPO_ARCHIVO_NO_PERMITIDO", mensaje: "Elige una imagen JPG, PNG o WEBP, o un archivo PDF." });
  }
  responderError(respuesta, {
    estado: fallo.status || 500,
    codigo: "ERROR_INTERNO",
    mensaje: "Ocurrió un problema al procesar la solicitud. Inténtalo de nuevo.",
  });
}

module.exports = manejarErrores;

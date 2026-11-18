function responderExito(respuesta, { estado = 200, mensaje, datos = null } = {}) {
  return respuesta.status(estado).json({
    correcto: true,
    mensaje,
    datos,
  });
}

function responderError(respuesta, { estado = 400, codigo, mensaje, detalles } = {}) {
  const cuerpo = { correcto: false, codigo, mensaje };
  if (detalles && Object.keys(detalles).length > 0) cuerpo.detalles = detalles;
  return respuesta.status(estado).json(cuerpo);
}

module.exports = { responderExito, responderError };

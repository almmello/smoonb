// Este arquivo não é mais usado diretamente
// A confirmação agora é feita no index.js com resumo detalhado
// Mantido para compatibilidade, mas pode ser removido no futuro

const { confirm } = require('../../../utils/prompt');

/**
 * Etapa 2: Confirmar execução (LEGACY - não usado mais)
 * A confirmação agora é feita no index.js após mostrar resumo detalhado
 */
module.exports = async () => {
  return await confirm('Deseja continuar com a restauração?', true);
};


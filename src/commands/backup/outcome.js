function backupOutcome(components) {
  const failed_components = Object.entries(components).filter(([, value]) => value?.success !== true).map(([name]) => name);
  return { success: failed_components.length === 0, status: failed_components.length ? 'incomplete' : 'completed', failed_components };
}
function storageComplete(buckets, expected) {
  return buckets.length === expected && buckets.every(b => !b.listingFailed && b.filesSkipped === 0 && b.filesDownloaded === b.totalFiles && b.objectCount === b.totalFiles);
}
function componentSummary(components) {
  const labels = { database: 'Banco de dados', database_separated: 'SQL separados', database_settings: 'Configurações do banco', auth_settings: 'Auth', realtime: 'Realtime', storage: 'Storage', custom_roles: 'Roles', edge_functions: 'Edge Functions', supabase_temp: 'Arquivos locais Supabase', migrations: 'Migrations' };
  const reasons = { migration_history_check_failed: 'não foi possível consultar o histórico; confira conexão e permissões', migration_export_failed: 'não foi possível exportar o histórico', history_absent: 'nenhum histórico registrado', history_empty: 'histórico vazio' };
  return Object.entries(components).map(([name, result]) => {
    const count = result?.file_count ?? result?.functions_count ?? result?.totalFiles;
    return `${result?.success === true ? 'OK' : 'FALHA'} - ${labels[name] || name}${count === undefined ? '' : ': ' + count}${result?.reason && result.reason !== 'success' ? ' (' + (reasons[result.reason] || result.reason) + ')' : ''}`;
  });
}
module.exports = { backupOutcome, storageComplete, componentSummary };

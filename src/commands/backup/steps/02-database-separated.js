const chalk = require('chalk');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

/**
 * Etapa 2: Backup Database Separado (SQL files para troubleshooting)
 */
module.exports = async ({ databaseUrl, backupDir, accessToken }) => {
  try {
    console.log(chalk.white('   - Criando backups SQL separados via Supabase CLI...'));
    
    const dbUrl = databaseUrl;
    const files = [];
    let totalSizeKB = 0;
    
    // 1. Backup do Schema
    console.log(chalk.white('   - Exportando schema...'));
    const schemaFile = path.join(backupDir, 'schema.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" -f "${schemaFile}"`, { 
        stdio: 'pipe', 
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken || '' } 
      });
      const stats = await fs.stat(schemaFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'schema.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Schema: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro no schema: ${error.message}`));
    }
    
    // 2. Backup dos Dados
    console.log(chalk.white('   - Exportando dados...'));
    const dataFile = path.join(backupDir, 'data.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" --data-only -f "${dataFile}"`, { 
        stdio: 'pipe', 
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken || '' } 
      });
      const stats = await fs.stat(dataFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'data.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Data: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro nos dados: ${error.message}`));
    }
    
    // 3. Backup dos Roles
    console.log(chalk.white('   - Exportando roles...'));
    const rolesFile = path.join(backupDir, 'roles.sql');
    
    try {
      execSync(`supabase db dump --db-url "${dbUrl}" --role-only -f "${rolesFile}"`, { 
        stdio: 'pipe', 
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken || '' } 
      });
      const stats = await fs.stat(rolesFile);
      const sizeKB = (stats.size / 1024).toFixed(1);
      files.push({ filename: 'roles.sql', sizeKB });
      totalSizeKB += parseFloat(sizeKB);
      console.log(chalk.green(`     ✅ Roles: ${sizeKB} KB`));
    } catch (error) {
      console.log(chalk.yellow(`     ⚠️ Erro nos roles: ${error.message}`));
    }
    
    return { 
      success: files.length > 0, 
      files, 
      totalSizeKB: totalSizeKB.toFixed(1) 
    };
    
  } catch (error) {
    console.log(chalk.yellow(`     ⚠️ Erro nos backups SQL separados: ${error.message}`));
    return { success: false, files: [], totalSizeKB: '0.0' };
  }
};


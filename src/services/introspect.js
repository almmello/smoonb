const { createClient } = require('@supabase/supabase-js');
const { runCommand } = require('./cli');

/**
 * Serviço de introspecção do banco de dados Supabase
 */
class IntrospectionService {
  constructor(config) {
    this.config = config;
    this.supabase = createClient(config.supabase.url, config.supabase.serviceKey);
  }

  /**
   * Executa query SQL no banco
   * @param {string} query - Query SQL
   * @returns {Promise<any[]>} - Resultado da query
   */
  async executeQuery(query) {
    const { data, error } = await this.supabase.rpc('exec_sql', { sql: query });
    if (error) {
      throw new Error(`Erro na query: ${error.message}`);
    }
    return data || [];
  }

  /**
   * Obtém inventário de extensões
   * @returns {Promise<object>} - Lista de extensões
   */
  async getExtensions() {
    try {
      const query = `SELECT extname, extversion FROM pg_extension ORDER BY extname;`;
      const result = await this.executeQuery(query);
      return {
        extensions: result.map(row => ({
          name: row.extname,
          version: row.extversion
        }))
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter extensões:', error.message);
      return { extensions: [] };
    }
  }

  /**
   * Obtém inventário de tabelas
   * @returns {Promise<object>} - Lista de tabelas
   */
  async getTables() {
    try {
      const query = `
        SELECT schemaname, tablename, tableowner 
        FROM pg_tables 
        WHERE schemaname IN ('public', 'auth', 'storage') 
        ORDER BY schemaname, tablename;
      `;
      const result = await this.executeQuery(query);
      return {
        tables: result.map(row => ({
          schema: row.schemaname,
          name: row.tablename,
          owner: row.tableowner
        }))
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter tabelas:', error.message);
      return { tables: [] };
    }
  }

  /**
   * Obtém inventário de políticas RLS
   * @returns {Promise<object>} - Lista de políticas
   */
  async getPolicies() {
    try {
      const query = `
        SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
        FROM pg_policies 
        ORDER BY schemaname, tablename, policyname;
      `;
      const result = await this.executeQuery(query);
      return {
        policies: result.map(row => ({
          schema: row.schemaname,
          table: row.tablename,
          name: row.policyname,
          permissive: row.permissive,
          roles: row.roles,
          command: row.cmd,
          qual: row.qual,
          withCheck: row.with_check
        }))
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter políticas:', error.message);
      return { policies: [] };
    }
  }

  /**
   * Obtém inventário de configurações RLS
   * @returns {Promise<object>} - Status RLS por tabela
   */
  async getRLSStatus() {
    try {
      const query = `
        SELECT n.nspname as schema_name, c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND n.nspname IN ('public', 'auth', 'storage')
        ORDER BY n.nspname, c.relname;
      `;
      const result = await this.executeQuery(query);
      return {
        rlsStatus: result.map(row => ({
          schema: row.schema_name,
          table: row.table_name,
          rowSecurityEnabled: row.relrowsecurity,
          forceRowSecurity: row.relforcerowsecurity
        }))
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter status RLS:', error.message);
      return { rlsStatus: [] };
    }
  }

  /**
   * Obtém inventário de publicações Realtime
   * @returns {Promise<object>} - Lista de publicações
   */
  async getRealtimePublications() {
    try {
      const publicationsQuery = `SELECT pubname FROM pg_publication ORDER BY pubname;`;
      const publications = await this.executeQuery(publicationsQuery);

      const publicationTablesQuery = `
        SELECT p.pubname, c.relname as table_name, n.nspname as schema_name
        FROM pg_publication_tables pt
        JOIN pg_publication p ON p.oid = pt.ptpubid
        JOIN pg_class c ON c.oid = pt.ptrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        ORDER BY p.pubname, n.nspname, c.relname;
      `;
      const publicationTables = await this.executeQuery(publicationTablesQuery);

      return {
        publications: publications.map(row => ({
          name: row.pubname,
          tables: publicationTables
            .filter(pt => pt.pubname === row.pubname)
            .map(pt => ({
              schema: pt.schema_name,
              table: pt.table_name
            }))
        }))
      };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter publicações Realtime:', error.message);
      return { publications: [] };
    }
  }

  /**
   * Obtém inventário de buckets de Storage
   * @returns {Promise<object>} - Lista de buckets e objetos
   */
  async getStorageInventory() {
    try {
      const { data: buckets, error: bucketsError } = await this.supabase.storage.listBuckets();
      
      if (bucketsError) {
        throw new Error(bucketsError.message);
      }

      const inventory = {
        buckets: []
      };

      for (const bucket of buckets) {
        const bucketInfo = {
          id: bucket.id,
          name: bucket.name,
          public: bucket.public,
          file_size_limit: bucket.file_size_limit,
          allowed_mime_types: bucket.allowed_mime_types,
          objects: []
        };

        try {
          // Listar objetos do bucket (sem baixar conteúdo)
          const { data: objects, error: objectsError } = await this.supabase.storage
            .from(bucket.name)
            .list('', { limit: 1000 });

          if (!objectsError && objects) {
            bucketInfo.objects = objects.map(obj => ({
              name: obj.name,
              size: obj.metadata?.size,
              last_modified: obj.updated_at,
              content_type: obj.metadata?.mimetype
            }));
          }
        } catch (error) {
          console.warn(`⚠️ Não foi possível listar objetos do bucket ${bucket.name}:`, error.message);
        }

        inventory.buckets.push(bucketInfo);
      }

      return inventory;
    } catch (error) {
      console.warn('⚠️ Não foi possível obter inventário de Storage:', error.message);
      return { buckets: [] };
    }
  }

  /**
   * Obtém inventário de Edge Functions
   * @returns {Promise<object>} - Lista de functions
   */
  async getEdgeFunctions() {
    try {
      const { stdout } = await runCommand('supabase functions list', {
        env: { ...process.env, SUPABASE_ACCESS_TOKEN: this.config.supabase.serviceKey }
      });

      // Parse da saída do comando
      const functions = [];
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('NAME') && !trimmed.startsWith('-')) {
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            functions.push({
              name: parts[0],
              version: parts[1] || 'unknown',
              status: parts[2] || 'unknown'
            });
          }
        }
      }

      return { functions };
    } catch (error) {
      console.warn('⚠️ Não foi possível obter Edge Functions:', error.message);
      return { functions: [] };
    }
  }

  /**
   * Gera inventário completo
   * @returns {Promise<object>} - Inventário completo
   */
  async generateFullInventory() {
    console.log('🔍 Gerando inventário completo...');

    const inventory = {
      generated_at: new Date().toISOString(),
      project_id: this.config.supabase.projectId,
      components: {}
    };

    // Extensões
    if (this.config.backup.includeRealtime) {
      inventory.components.extensions = await this.getExtensions();
    }

    // Tabelas
    inventory.components.tables = await this.getTables();

    // Políticas RLS
    inventory.components.policies = await this.getPolicies();
    inventory.components.rlsStatus = await this.getRLSStatus();

    // Realtime
    if (this.config.backup.includeRealtime) {
      inventory.components.realtime = await this.getRealtimePublications();
    }

    // Storage
    if (this.config.backup.includeStorage) {
      inventory.components.storage = await this.getStorageInventory();
    }

    // Edge Functions
    if (this.config.backup.includeFunctions) {
      inventory.components.functions = await this.getEdgeFunctions();
    }

    return inventory;
  }
}

module.exports = { IntrospectionService };

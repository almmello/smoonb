/**
 * UI/console padronizado do smoonb CLI.
 * Toda saída para o usuário usa este módulo para legibilidade (incl. Windows PowerShell).
 * Regras: sem chalk.dim/chalk.gray/chalk.blackBright em blocos longos; cores só para rótulos/ênfase.
 * Saída principal em stdout.
 */
const chalk = require('chalk');

const stdout = process.stdout;

function writeOut(msg) {
  stdout.write(msg + (msg.endsWith('\n') ? '' : '\n'));
}

/**
 * Título / cabeçalho (cyan, boa leitura).
 */
function title(text) {
  writeOut(chalk.cyan(text));
}

/**
 * Texto informativo (branco/default, nunca dim/gray).
 */
function info(text) {
  writeOut(chalk.white(text));
}

/**
 * Aviso (amarelo).
 */
function warn(text) {
  writeOut(chalk.yellow(text));
}

/**
 * Erro (vermelho).
 */
function error(text) {
  writeOut(chalk.red(text));
}

/**
 * Erro em destaque (vermelho + bold) para títulos de falha.
 */
function errorBold(text) {
  writeOut(chalk.red.bold(text));
}

/**
 * Passo / label de etapa (azul).
 */
function step(text) {
  writeOut(chalk.blue(text));
}

/**
 * Sucesso (verde).
 */
function success(text) {
  writeOut(chalk.green(text));
}

/**
 * Link ou destaque secundário (cyan, não apagado).
 */
function link(text) {
  writeOut(chalk.cyan(text));
}

/**
 * Bloco de texto longo (ex.: bundle de diagnóstico) — SEM cor para copiar/colar e legibilidade.
 */
function block(text) {
  if (Array.isArray(text)) {
    text.forEach((line) => writeOut(line));
  } else {
    writeOut(String(text));
  }
}

/**
 * Múltiplas linhas em cor padrão (branco), sem dim/gray.
 */
function multiline(text) {
  writeOut(chalk.white(String(text)));
}

/**
 * Sugestão / hint curto — branco para manter legível (não gray).
 */
function hint(text) {
  writeOut(chalk.white(text));
}

const ui = {
  title,
  info,
  warn,
  error,
  errorBold,
  step,
  success,
  link,
  block,
  multiline,
  hint,
  chalk
};

module.exports = ui;

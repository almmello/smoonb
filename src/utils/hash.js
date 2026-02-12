const crypto = require('crypto');
const fs = require('fs');

/**
 * Calcula SHA256 de um arquivo usando stream
 * @param {string} filePath - Caminho do arquivo
 * @returns {Promise<string>} - Hash SHA256 em hexadecimal
 */
async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data) => {
      hash.update(data);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Calcula SHA256 de uma string
 * @param {string} data - String para calcular hash
 * @returns {string} - Hash SHA256 em hexadecimal
 */
function sha256String(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

module.exports = {
  sha256,
  sha256String
};

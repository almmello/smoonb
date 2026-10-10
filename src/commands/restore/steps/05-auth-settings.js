const { applyConfig } = require('../management');
const { prepareAuth } = require('../auth');
const allowed = require('../auth-fields.json');
module.exports = async (context, { request } = {}) => {
  const { desired, writeOnly } =
    context.authConfig || (await prepareAuth(context));
  return applyConfig(
    context.targetProject,
    'config/auth',
    desired,
    allowed,
    request,
    { writeOnly },
  );
};

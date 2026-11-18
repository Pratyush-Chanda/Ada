module.exports = async function handler(req, res) {
  const { default: apiHandler } = await import("../lib/api/raw.js");
  return apiHandler(req, res);
};

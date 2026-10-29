module.exports = {
    port: process.env.SERVER_PORT || 8000,
    prefixApiVersion: process.env.PREFIX_API_VERSION || "/api/v1",
    viewsFolder: `${__dirname}/../src/resources/views`,
    viewEngine: "ejs",
};
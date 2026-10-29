const express= require("express");
const cors = require("cors");
const app = express();
const path = require("path"); 
const config = require("config"); 

app.use(cors()); // frontend có thể lấy đc tài nguyên backend
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("views", config.get("app.viewsFolder"));
app.set("view engine", config.get("app.viewEngine"));
app.use(config.get("app.prefixApiVersion"), require(`${__dirname}/../routers/web`));
// đường dẫn tới thư mục public:
app.use(express.static(path.join(__dirname, "../public")));

module.exports = app;
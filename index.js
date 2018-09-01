var app = require('express')();
var bodyParser  = require("body-parser");
var urlencodedParser = bodyParser.urlencoded({extended: true});
var fs = require('fs');


app.use(urlencodedParser);
app.use(bodyParser.json());
app.set('view engine','ejs');





app.listen(5000 , (err)=> {
	console.log("We are at port 5000");
} );

/********************

JWT module
(c) 2018 Eternity Echo

Authors:
Justine Che T. Romero

*******************/


var SHA256 = require('crypto-js/SHA256');

exports.SECRET = "5526B47F0B2B5B87AE1EB88FA1CAC63F84800F0019B56F6F80B68C0850B63CDC";

function btoa(str)
{
	return Buffer.from(str).toString('base64');
}

function atob(enc)
{
	return Buffer.from(enc,'base64').toString();
}



var generate_head = (req) =>
{
	return { };
}


var generate_token = (payload,salt = exports.SECRET)=>
{
	var a = 
	{
		head :generate_head(),
		payload : payload
	};

	a.hash = SHA256( JSON.stringify(a.head) + JSON.stringify(a.payload) + salt ).toString();
	return btoa(JSON.stringify(a));
} 

var validate_token = ( token , salt = exports.SECRET) =>
{
	let a = atob(token);
	a = JSON.parse(a);
	if(( a.hash == SHA256( JSON.stringify(a.head) + JSON.stringify(a.payload) + salt ).toString() ))
		return a.payload;
	return false;
}

var parse_token = ( token ) =>
{
	let a = atob(token);
	a = JSON.parse(a);
	return a.payload;
}

exports.new = generate_token;
exports.validate = validate_token;
exports.parse = parse_token;
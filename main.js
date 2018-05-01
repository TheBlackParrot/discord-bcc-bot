const discord = require("discord.js");
const client = new discord.Client();
const request = require("request");
const fs = require("fs");
const strSim = require('string-similarity');

const settings = require("./settings.json");
var servers = require("./servers.json");
var cacheData = require("./cache.json");
var functionData = require("./functions.json");

var serverChannel;
client.on("ready", function() {
	console.log("ready, logged in as " + client.user.tag);
	serverChannel = client.channels.get(settings.server_channel);
	serverUpdate();
});

var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(date) {
	var hours = date.getHours();
	var minutes = date.getMinutes();
	var ampm = (hours >= 12 ? 'PM' : 'AM');
	return months[date.getMonth()] + " " + date.getDate() + " " + date.getFullYear() + ", " + ((hours % 12) ? hours % 12 : 12) + ":" + minutes.toString().padStart(2, "0") + " " + ampm + " CDT";
}

var serverData = {};
var awaitingUpdates = 0;
function serverUpdate() {
	if(!Object.keys(serverData).length) {
		grabMasterServerData(serverUpdate);
		return;
	}

	setTimeout(function() {
		grabMasterServerData(serverUpdate);
	}, 30000);

	if(!servers.length) {
		return;
	}

	var datetime = new Date();

	awaitingUpdates = servers.length;
	for(var idx in servers) {
		triggerUpdate(idx);
	}
}

function triggerUpdate(idx) {
	var datetime = new Date();
	var server = servers[idx];
	var addr = server.ip + ":" + server.port;

	//console.log(server);

	if(addr in serverData) {
		var sd = cacheData[addr];
		var out = [
			'-----------------------------------------------',
			':' + ("icon" in server ? server.icon : "desktop") + ':  **' + sd.title + '** hosting *' + sd.gamemode + '* for ' + sd.players + ' players',
			(sd.private ? ":lock: Private" : ":unlock: Public") + "        " + (sd.dedicated ? ":white_check_mark:" : ":black_large_square:") + " Dedicated",
			'-----------------------------------------------'
		];

		servers[idx].seen = sd.timestamp;
	} else {
		if(addr in cacheData) {
			var sd = cacheData[addr];
			var out = [
				'-----------------------------------------------',
				':' + ("icon" in server ? server.icon : "desktop") + ':  **' + sd.title + '** is currently offline',
				':warning: Last seen ' + formatDate(new Date(server.seen)),
				'-----------------------------------------------'
			];
		} else {
			var out = [
				'-----------------------------------------------',
				':warning: Unknown server, no data has been cached.',
				':warning: Last seen ' + formatDate(new Date(server.seen)),
				'-----------------------------------------------',
			];
		}
	}

	if("host" in server) {
		out.push('Host: `' + server.host + '`');
	}
	out = out.concat([
		'Address: `' + server.ip + ":" + server.port + '`',
		'Last updated ' + formatDate(datetime)
	]);

	// i hate then/catch it looks so messy fml
	var to_send = out.join("\n");
	serverChannel.fetchMessage(server.message).then(function(message) {
		message.edit(out.join("\n"));
		updateFinished();
	}).catch(function() {
		serverChannel.send(out.join("\n")).then(function(_) {
			servers[idx].message = _.id
			updateFinished();
		});
	});
}

function updateFinished() {
	awaitingUpdates--;
	
	if(!awaitingUpdates) {
		fs.writeFileSync("./servers.json", JSON.stringify(servers), "utf-8");
		//console.log("updated at " + Date.now());
	}
}

function grabMasterServerData(callback) {
	request('http://master2.blockland.us', function(err, response, body) {
		if(err) {
			console.log(err);
			return;
		}

		//console.log(response.statusCode);
		if(response.statusCode != 200) {
			console.log("master server didn't return 200, assuming it's down " + Date.now());
			return;
		}

		for(var k in serverData) {
			delete serverData[k];
		}

		var lines = body.split("\n");
		for(var idx in lines) {
			var line = lines[idx];
			var fields = line.split("\t");

			if(fields[0] == "FIELDS" || fields[0] == "START" || fields[0] == "END") {
				continue;
			}

			var item = {
				ip: fields[0],
				port: parseInt(fields[1], 10),
				private: parseInt(fields[2], 10),
				dedicated: parseInt(fields[3], 10),
				title: fields[4],
				players: parseInt(fields[5], 10),
				maxplayers: parseInt(fields[6], 10),
				gamemode: fields[7],
				bricks: parseInt(fields[8], 10),
				timestamp: Date.now()
			};

			serverData[fields[0] + ":" + fields[1]] = item;
			cacheData[fields[0] + ":" + fields[1]] = item;
		}

		fs.writeFileSync("./cache.json", JSON.stringify(cacheData), "utf-8");

		if(typeof callback === "function") {
			callback();
		}
	});
}

function handleRoleChannel(msg, prefix) {
	var content = msg.cleanContent;

	switch(prefix) {
		case "+":
			if(!(settings.allowed_channels.includes(msg.channel.name))) {
				//console.log("not allowed in " + msg.channel.name);
				break;
			}
			
			var role = content.substr(1);
			
			if(!(settings.allowed_roles.includes(role))) {
				msg.reply("`" + role + "` is not a toggleable role.").then(function(reply) {
					msg.delete(10000);
					reply.delete(10000);
				});
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.addRole(roles.find("name", role));
			msg.reply("You now have the `" + role + "` role.").then(function(reply) {
				msg.delete(10000);
				reply.delete(10000);
			});

			break;

		case "-":
			if(!(settings.allowed_channels.includes(msg.channel.name))) {
				//console.log("not allowed in " + msg.channel.name);
				break;
			}
			
			var role = content.substr(1);
			
			if(!(settings.allowed_roles.includes(role))) {
				msg.reply("`" + role + "` is not a toggleable role.").then(function(reply) {
					msg.delete(10000);
					reply.delete(10000);
				});
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.removeRole(roles.find("name", role));
			msg.reply("You no longer have the `" + role + "` role.").then(function(reply) {
				msg.delete(10000);
				reply.delete(10000);
			});

			break;

		case "!":
			break;

		default:
			/* specific case here */
			if(msg.channel.name == "role-request") {
				if(!(["+", "-", "!"].includes(prefix)) && msg.author.id != client.user.id) {
					msg.delete();
				}
			}
			break;
	}
}

function handleServersChannel(msg, prefix) {
	if(!msg.member.hasPermission("MANAGE_GUILD")) {
		if(msg.channel.equals(serverChannel)) {
			msg.delete();
		}

		return;
	}

	var content = msg.cleanContent.substr(1);
	var parts = content.split("|");
	if(parts.length == 0) {
		msg.author.send("No arguments were specified.");
		return;
	}

	switch(prefix) {
		case "+":
			// +127.0.0.1:28000|TheBlackParrot#1352|pencil
			var addrparts = parts[0].split(":");
			if(addrparts.length < 2) {
				msg.author.send("An IP address and port must be specified for the first argument. (e.g. `127.0.0.1:28000`)");
				msg.delete();
				return;
			}

			var host = "-";
			if(parts.length >= 2) {
				if(parts[1].indexOf("#") == -1 && parts[1] != "-") {
					msg.author.send("No discriminator was provided for the host. (e.g. TheBlackParrot**#1352**)");
					msg.delete();
					return;
				} else {
					var host = parts[1];
				}
			}

			var ip = addrparts[0];
			var port = parseInt(addrparts[1]);

			var exists = false;
			for(var idx in servers) {
				var server = servers[idx];

				if(server.ip == ip && server.port == port) {
					exists = true;
					break;
				}
			}

			var feedback = [];
			if(exists) {
				if(host != "-") {
					servers[idx].host = host;
				}

				if(parts.length == 3) {
					if(parts[2] != "-") {
						servers[idx].icon = parts[2];
					}
				}

				fs.writeFileSync("./servers.json", JSON.stringify(servers), "utf-8");

				feedback.push('Successfully edited `' + (ip + ":" + port) + '`');
				feedback.push('```json' + JSON.stringify(servers[idx], null, 2) + '```');
			} else {
				var item = {
					ip: ip,
					port: port,
					message: ""
				}

				if(host != "-") {
					item.host = host;
				}

				if(parts.length == 3) {
					if(parts[2] != "-") {
						item.icon = parts[2];
					}
				}

				servers.push(item);
				fs.writeFileSync("./servers.json", JSON.stringify(servers), "utf-8");

				feedback.push('Successfully created `' + (ip + ":" + port) + '`');
				feedback.push('```' + JSON.stringify(item, null, 2) + '```');
			}

			if(feedback.length) {
				msg.author.send(feedback.join("\n"));
			}

			msg.delete();
			break;

		case "-":
			//-127.0.0.1:28000
			var addrparts = parts[0].split(":");
			if(addrparts.length < 2) {
				msg.author.send("An IP address and port must be specified for the first argument. (e.g. `127.0.0.1:28000`)");
				return;
			}

			var ip = addrparts[0];
			var port = parseInt(addrparts[1]);

			var exists = false;
			for(var idx in servers) {
				var server = servers[idx];

				if(server.ip == ip && server.port == port) {
					exists = true;
					serverChannel.fetchMessage(server.message).then(function(message) {
						message.delete();
					});
					servers.splice(idx, 1);
					break;
				}
			}

			if(exists) {
				fs.writeFileSync("./servers.json", JSON.stringify(servers), "utf-8");

				var feedback = 'Successfully deleted `' + (ip + ":" + port) + '`';
			} else {
				var feedback = "There is no entry for `" + (ip + ":" + port) + "`";
			}
			msg.author.send(feedback);

			msg.delete();
			break;

		case "!":
			break;

		default:
			/* specific case here */
			if(msg.channel.equals(serverChannel)) {
				if(!(["+", "-", "!"].includes(prefix)) && msg.author.id != client.user.id) {
					msg.delete();
				}
			}
			break;
	}	
}

function parseArgList(args) {
	var out = [];
	var opt = [];

	for(var i in args) {
		var arg = args[i];
		if(arg.substr(0, 2) == "o:") {
			opt.push(arg.substr(2))
		} else {
			out.push(arg);
		}
	}

	if(opt.length) {
		opt[0] = "[" + opt[0];
		opt[opt.length-1] = opt[opt.length-1] + "]";
	}

	return out.concat(opt).join(", ");
}

var caseInsensitiveHandler = {
	has: function(obj, prop) {
		if(prop in obj) {
			//console.log("prop was in obj");
			return true;
		} else {
			//console.log("prop was not in obj");
			let keys_original = Object.keys(obj);
			let keys = Object.keys(obj).map(function(_) { 
				return _.toString().toLowerCase();
			});

			//console.log(keys);

			var idx = keys.indexOf(prop.toLowerCase());
			//console.log("index: " + idx);
			if(idx != -1) {
				//console.log("idx not -1: " + obj[keys_original[idx]]);
				return true;
			} else {
				//console.log("idx -1");
				return false;
			}
			return false;
		}
	},

	get: function(obj, prop) {
		if(prop in obj) {
			//console.log("prop was in obj");
			return obj[prop];
		} else {
			//console.log("prop was not in obj");
			let keys_original = Object.keys(obj);
			let keys = Object.keys(obj).map(function(_) { 
				return _.toString().toLowerCase();
			});

			//console.log(keys);

			var idx = keys.indexOf(prop.toLowerCase());
			//console.log("index: " + idx);
			if(idx != -1) {
				//console.log("idx not -1: " + obj[keys_original[idx]]);
				return obj[keys_original[idx]];
			} else {
				//console.log("idx -1");
				return undefined;
			}
		}		
	},

	set: function(obj, prop, value) {
		if(prop in obj) {
			obj[prop] = value;
		} else {
			let keys_original = Object.keys(obj);
			let keys = Object.keys(obj).map(function(_) { 
				return _.toString().toLowerCase();
			});

			//console.log(keys);

			var idx = keys.indexOf(prop.toLowerCase());
			//console.log("index: " + idx);
			if(idx != -1) {
				//console.log("idx not -1: " + obj[keys_original[idx]]);
				return obj[keys_original[idx]] = value;
			} else {
				//console.log("idx -1");
				return obj[prop] = value;
			}
		}
	},

	deleteProperty: function(obj, prop) {
		if(prop in obj) {
			//console.log("prop was in obj");
			delete obj[prop];
		} else {
			//console.log("prop was not in obj");
			let keys_original = Object.keys(obj);
			let keys = Object.keys(obj).map(function(_) { 
				return _.toString().toLowerCase();
			});

			//console.log(keys);

			var idx = keys.indexOf(prop.toLowerCase());
			//console.log("index: " + idx);
			if(idx != -1) {
				//console.log("idx not -1: " + obj[keys_original[idx]]);
				delete obj[keys_original[idx]];
			} else {
				//console.log("idx -1");
				return false;
			}
			return false;
		}		
	}
}

function getRelatedFunctions(func, className, amount) {
	if(typeof className === "string") {
		var funcList = functionData[className];
	} else if(typeof className === "number") {
		amount = className;
		var funcList = functionData;
	}

	if(typeof funcList === "undefined") {
		var functionDataProxy = new Proxy(functionData, caseInsensitiveHandler);
		
		if(typeof className === "string") {
			var funcList = functionDataProxy[className];
		} else if(typeof className === "number") {
			amount = className;
			var funcList = functionDataProxy;
		}
	}

	if(!Object.keys(funcList).length) {
		return [];
	}

	return strSim.findBestMatch(func, Object.keys(funcList)).ratings.sort(function(a, b) {
		if(a.rating > b.rating) {
			return -1
		} else if(a.rating < b.rating) {
			return 1;
		} else {
			return 0;
		}
	}).filter(function(row) {
		return row.rating != 1 && row.rating >= 0.33;
	}).map(function(row) {
		return row.target;
	});	
}

function findPossibleDuplicateFunctions(func, className) {
	var functionDataProxy = new Proxy(functionData, caseInsensitiveHandler);
	var keys = Object.keys(functionData);

	var possibleDupes = [];

	if(className && func in functionDataProxy) {
		possibleDupes.push("NONE");
	}

	for(var i in keys) {
		var key = keys[i];
		var value = functionData[key];

		if(!Array.isArray(value) && typeof value === "object") {
			var classDataProxy = new Proxy(value, caseInsensitiveHandler);

			if(func in classDataProxy) {
				if(className) {
					if(className.toLowerCase() == key.toLowerCase()) {
						continue;
					}
				}

				possibleDupes.push(key);
			}			
		}
	}

	return possibleDupes;
}

function handleGeneralCommand(msg) {
	var parts = msg.cleanContent.split(" ");

	switch(parts[0]) {
		case "func":
		case "function":
		case "args":
			if(parts.length < 2) {
				return;
			}

			// TODO: clean this shit up

			var func = parts[1].trim();
			var func_parts = func.split("::");
			var hasClass = false;

			var dupes = findPossibleDuplicateFunctions(func);

			var functionDataProxy = new Proxy(functionData, caseInsensitiveHandler);

			if(func_parts.length == 1) {
				if(!(func in functionDataProxy)) {
					var possibles = getRelatedFunctions(func, 10);
					if(possibles.length) {
						if(dupes.length) {
							msg.channel.send("No arguments have been defined for `" + func + "`\n\nDid you mean any of these?\n`" + possibles.join(", ") + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
						} else {
							msg.channel.send("No arguments have been defined for `" + func + "`\n\nDid you mean any of these?\n`" + possibles.join(", ") + "`");
						}
					} else {
						if(dupes.length) {
							msg.channel.send("No arguments have been defined for `" + func + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
						} else {
							msg.channel.send("No arguments have been defined for `" + func + "`");
						}
					}
					return;
				}

				var funcs = functionDataProxy[func];
				if(typeof funcs === "object" && !Array.isArray(funcs)) {
					msg.channel.send("`" + func + "` is a class.");
					return;
				}
			} else if(func_parts.length == 2) {
				var className = func_parts[0];
				var func = func_parts[1];
				hasClass = true;

				var dupes = findPossibleDuplicateFunctions(func, className);

				if(!(className in functionDataProxy)) {
					if(dupes.length) {
						msg.channel.send("No functions have been defined for class `" + className + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
					} else {
						msg.channel.send("No functions have been defined for class `" + className + "`");
					}
					return;
				}
				var classFuncs = functionDataProxy[className];
				var classFuncsProxy = new Proxy(classFuncs, caseInsensitiveHandler);

				if(!(func in classFuncsProxy)) {
					var possibles = getRelatedFunctions(func, className, 10);
					if(possibles.length) {
						if(dupes.length) {
							msg.channel.send("No arguments have been defined for `" + func + "` in class `" + className + "`\n\nDid you mean any of these?\n`" + possibles.join("`, `") + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
						} else {
							msg.channel.send("No arguments have been defined for `" + func + "` in class `" + className + "`\n\nDid you mean any of these?\n`" + possibles.join("`, `") + "`");
						}
					} else {
						if(dupes.length) {
							msg.channel.send("No arguments have been defined for `" + func + "` in class `" + className + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
						} else {
							msg.channel.send("No arguments have been defined for `" + func + "` in class `" + className + "`");
						}
					}
					return;
				}

				var funcs = classFuncsProxy[func];
			}

			if(hasClass) {
				var possibles = getRelatedFunctions(func, className, 10);
				if(possibles.length) {
					if(dupes.length) {
						msg.channel.send("`" + className + "::" + func + "(" + parseArgList(["self"].concat(funcs)) + ");`\n\nSimilarly named functions: `" + possibles.join("`, `") + "`\n\nThis function also has a definition in class(es) `" + dupes.join("`, `") + "`");
					} else {
						msg.channel.send("`" + className + "::" + func + "(" + parseArgList(["self"].concat(funcs)) + ");`\n\nSimilarly named functions: `" + possibles.join("`, `") + "`");
					}
				} else {
					if(dupes.length) {
						msg.channel.send("`" + className + "::" + func + "(" + parseArgList(["self"].concat(funcs)) + ");`\n\nThis function also has a definition in class(es) `" + dupes.join("`, `") + "`");
					} else {
						msg.channel.send("`" + className + "::" + func + "(" + parseArgList(["self"].concat(funcs)) + ");`");
					}
				}
			} else {
				var possibles = getRelatedFunctions(func, 10);
				if(possibles.length) {
					if(dupes.length) {
						msg.channel.send("`" + func + "(" + parseArgList(funcs) + ");`\n\Similarly named functions: `" + possibles.join("`, `") + "`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
					} else {
						msg.channel.send("`" + func + "(" + parseArgList(funcs) + ");`\n\Similarly named functions: `" + possibles.join("`, `") + "`");
					}
				} else {
					if(dupes.length) {
						msg.channel.send("`" + func + "(" + parseArgList(funcs) + ");`\n\nThis function has a definition in class(es) `" + dupes.join("`, `") + "`");
					} else {
						msg.channel.send("`" + func + "(" + parseArgList(funcs) + ");`");
					}
				}
			}
			break;

		case "editfunc":
		case "editfunction":
		case "editargs":
			if(parts.length < 2) {
				return;
			}

			if(msg.channel.type == "dm" || msg.channel.type == "group") {
				var guild = client.guilds.get("226534113329283072");
				var member = guild.members.get(msg.author.id);

				if(!member.hasPermission("MANAGE_GUILD")) {
					if(!member.roles.has("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.has("440420951394615307")) {
						return;
					}
				}
			}

			var func = parts[1];
			var hasClass = false;
			if(func.includes("::")) {
				var className = func.split("::")[0];
				var func = func.split("::")[1];
				var hasClass = true;
			}

			var args = parts.slice(2).map(function(item) {
				return item.replace(/_/g, " ");
			});

			var functionDataProxy = new Proxy(functionData, caseInsensitiveHandler);

			if(hasClass) {
				if(!(className in functionDataProxy)) {
					functionDataProxy[className] = {};
				}

				var classDataProxy = new Proxy(functionDataProxy[className], caseInsensitiveHandler);
				classDataProxy[func] = args;
				msg.channel.send("Updated `" + func + "` in class `" + className + "` to `" + args.join(", ") + "`");
			} else {
				//if(typeof functionDataProxy[func] !== "object") {
				if(typeof functionDataProxy[func] === "undefined" || Array.isArray(functionDataProxy[func])) {
					functionDataProxy[func] = args;
					msg.channel.send("Updated `" + func + "` to `" + args.join(", ") + "`");
				} else {
					msg.channel.send("This is currently defined as a class.");
					return;
				}
			}

			fs.writeFileSync("./functions.json", JSON.stringify(functionData), "utf-8");
			break;

		case "parseraw":
			if(parts.length <= 1) {
				return;
			}

			if(msg.channel.type == "dm" || msg.channel.type == "group") {
				var guild = client.guilds.get("226534113329283072");
				var member = guild.members.get(msg.author.id);

				if(!member.hasPermission("MANAGE_GUILD")) {
					if(!member.roles.has("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.has("440420951394615307")) {
						return;
					}
				}
			}

			var line = msg.cleanContent.split(" ").slice(1).join(" ");
			var hasClass = (line.indexOf("::") != -1);
			var parts = line.split("(");
			var currentlyOptional = false;

			var args = parts[1].split(",").map(function(arg) {
				if(arg.indexOf("[") != -1) {
					currentlyOptional = true;
				}
				
				arg = (currentlyOptional ? "o:" : "") + arg.replace(/\%/g, '').replace(/\(|\)/g, '').replace(/\[|\]/g, '').trim();

				if(arg.indexOf("]") != -1) {
					currentlyOptional = false;
				}

				return arg;
			}).slice(hasClass ? 1 : 0);

			msg.channel.send("editargs " + (parts[0] + " " + args.join(" ")).trim()).then(function(newmsg) {
				try {
					newmsg.delete(15000);
				} catch(err) {
					return;
				}
			});

			try {
				msg.delete();
			} catch(err) {
				return;
			}
			break;

		case "removefunc":
		case "removefunction":
		case "removeargs":
		case "remfunc":
		case "remfunction":
		case "remargs":
			if(parts.length < 1) {
				return;
			}

			if(msg.channel.type == "dm" || msg.channel.type == "group") {
				var guild = client.guilds.get("226534113329283072");
				var member = guild.members.get(msg.author.id);

				if(!member.hasPermission("MANAGE_GUILD")) {
					if(!member.roles.has("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.has("440420951394615307")) {
						return;
					}
				}
			}

			var func = parts[1].trim();
			var func_parts = func.split("::");
			var hasClass = false;

			var functionDataProxy = new Proxy(functionData, caseInsensitiveHandler);

			if(func_parts.length == 1) {
				if(!(func in functionDataProxy)) {
					msg.channel.send("No arguments have been defined for `" + func + "`");
					return;
				}

				var funcs = functionDataProxy[func];
				if(typeof funcs === "object" && !Array.isArray(funcs)) {
					msg.channel.send("`" + func + "` is a class.");
					return;
				}

				delete functionDataProxy[func];
			} else if(func_parts.length == 2) {
				var className = func_parts[0];
				var func = func_parts[1];
				hasClass = true;

				if(!(className in functionDataProxy)) {
					msg.channel.send("No functions have been defined for class `" + className + "`");
					return;
				}
				var classFuncs = functionDataProxy[className];
				var classFuncsProxy = new Proxy(classFuncs, caseInsensitiveHandler);

				if(!(func in classFuncsProxy)) {
					msg.channel.send("No arguments have been defined for `" + func + "` in class `" + className + "`");
					return;
				}

				delete classFuncsProxy[func];
			}

			fs.writeFileSync("./functions.json", JSON.stringify(functionData), "utf-8");
			break;
	}
}

client.on("message", function(msg) {
	if(msg.author.id == client.user.id) {
		return;
	}

	var content = msg.cleanContent;
	var prefix = content.substr(0, 1);

	if(msg.channel.type == "dm") {
		handleGeneralCommand(msg);
		return;
	}

	switch(msg.channel.name) {
		case "role-request":
			handleRoleChannel(msg, prefix);
			break;

		case "servers":
			handleServersChannel(msg, prefix);
			break;

		case "general-commands":
			handleGeneralCommand(msg);
			break;
	}
});

client.login(settings.token);
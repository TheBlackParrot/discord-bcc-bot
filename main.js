const discord = require("discord.js");
const client = new discord.Client();
const request = require("request");
const fs = require("fs");
const strSim = require('string-similarity');

var settings = require("./settings.json");
var servers = require("./servers.json");
var cacheData = require("./cache.json");
var functionData = require("./functions.json");
var muteData = require("./mutes.json");
var tmpMsgData = require("./tmpMsgs.json");

var t = settings.allowed_roles.map(function(role) {
	return role.toLowerCase();
});
settings.allowed_roles = t;

var serverChannel;
client.on("ready", function() {
	console.log("ready, logged in as " + client.user.tag);
	serverChannel = client.channels.get(settings.server_channel);
});

var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(date) {
	if(typeof date !== "object" || typeof date === "undefined") { return "never"; }
	if(isNaN(date.getMonth())) {
		return "never";
	}
	var hours = date.getHours();
	var minutes = date.getMinutes();
	var ampm = (hours >= 12 ? 'PM' : 'AM');
	return months[date.getMonth()] + " " + date.getDate() + " " + date.getFullYear() + ", " + ((hours % 12) ? hours % 12 : 12) + ":" + minutes.toString().padStart(2, "0") + " " + ampm + " CDT";
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
			
			if(!(settings.allowed_roles.includes(role.toLowerCase()))) {
				msg.reply("`" + role + "` is not a toggleable role.").then(function(reply) {
					setTimeout(function() {
						msg.delete();
						reply.delete();
					}, 10000);
				});
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.roles.add(roles.find(roleObj => roleObj.name.toLowerCase() == role.toLowerCase()));

			msg.reply("You now have the `" + role + "` role.").then(function(reply) {
				setTimeout(function() {
					msg.delete();
					reply.delete();
				}, 10000);
			});

			if(role.indexOf("Mentionable") != -1) {
				member.roles.add(roles.find(roleObj => roleObj.name == "Mentionable"));
			}

			break;

		case "-":
			if(!(settings.allowed_channels.includes(msg.channel.name))) {
				//console.log("not allowed in " + msg.channel.name);
				break;
			}
			
			var role = content.substr(1);
			
			if(!(settings.allowed_roles.includes(role.toLowerCase()))) {
				msg.reply("`" + role + "` is not a toggleable role.").then(function(reply) {
					setTimeout(function() {
						msg.delete();
						reply.delete();
					}, 10000);
				});
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.roles.remove(roles.find(roleObj => roleObj.name.toLowerCase() == role.toLowerCase()));

			msg.reply("You no longer have the `" + role + "` role.").then(function(reply) {
				setTimeout(function() {
					msg.delete();
					reply.delete();
				}, 10000);
			});

			if(role.indexOf("Mentionable") != -1) {
				var removeMentionable = true;
				member.roles.map(function(_) {
					if(role == _.name) {
						return;
					}
					if(_.name.indexOf("Mentionable") != -1 && _.name != "Mentionable") {
						removeMentionable = false;
					}
				});
				if(removeMentionable) {
					member.roles.remove(roles.find(roleObj => roleObj.name == "Mentionable"));
				}
			}

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
					if(!member.roles.get("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.get("440420951394615307")) {
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
					if(!member.roles.get("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.get("440420951394615307")) {
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
					if(!member.roles.get("440420951394615307")) {
						return;
					}
				}
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!msg.member.roles.get("440420951394615307")) {
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

		case "mute":
		case "silence":
		case "shh":
			if(parts.length < 2) {
				return;
			}

			if(msg.channel.type == "dm" || msg.channel.type == "group") {
				return;
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!(msg.member.roles.get("440420951394615307") || msg.member.roles.get("464248977798332418"))) {
						return;
					}
				}
			}

			var victim = msg.mentions.members.first();
			if(!victim) {
				victim = msg.guild.members.get(parts[1]);
				if(!victim) {
					msg.reply("Could not find this member.");
					return;
				}
			}

			var minutes = parseInt(parts[2].trim());
			if(!minutes) {
				return;
			}

			var reason;
			if(parts.length > 3) {
				reason = parts.slice(3).join(" ");
			}

			if(victim.roles.get("478326753790787596")) {
				msg.reply("User is already muted.");
				return;
			}

			victim.roles.add("478326753790787596");

			muteData.push({
				"member": victim.id,
				"timestampEnd": minutes == -1 ? -1 : Date.now() + (minutes*60*1000)
			});
			fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

			var out = [];
			if(minutes != -1) {
				out.push("You have been muted in Blockland Content Creators by a moderator for " + minutes.toLocaleString() + " minute(s).");
			} else {
				out.push("You have been permanently muted in Blockland Content Creators by a moderator.");
			}

			if(reason) {
				out.push("```");
				out.push(reason);
				out.push("```");
			}

			victim.send(out.join("\n"));
			break;

		case "unsilence":
		case "unshh":
		case "unmute":
			if(parts.length < 1) {
				return;
			}

			if(msg.channel.type == "dm" || msg.channel.type == "group") {
				return;
			} else {
				if(!msg.member.hasPermission("MANAGE_GUILD")) {
					if(!(msg.member.roles.get("440420951394615307") || msg.member.roles.get("464248977798332418"))) {
						return;
					}
				}
			}

			var victim = msg.mentions.members.first();
			if(!victim) {
				victim = msg.guild.members.get(parts[1]);
				if(!victim) {
					msg.reply("Could not find this member.");
					return;
				}
			}

			if(!victim.roles.get("478326753790787596")) {
				msg.reply("User is not muted.");
				return;
			}

			victim.roles.remove("478326753790787596");

			for(var idx in muteData) {
				var muteRow = muteData[idx];
				if(muteRow.member == victim.id) {
					muteData.splice(idx);
					break;
				}
			}
			fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");

			victim.send("Your mute in Blockland Content Creators has ended.");
			break;
	}
}

function handleTempChannel(msg) {
	let member = msg.member;

	if(!member.voice.sessionID) {
		msg.delete();
	} else {
		tmpMsgData.push({
			"msgid": msg.id,
			"channelid": msg.channel.id,
			"timestampEnd": Date.now() + (720*60*1000)
		});
		fs.writeFileSync("./tmpMsgs.json", JSON.stringify(tmpMsgData), "utf-8");
	}
}

function muteTick() {
	if(!muteData.length) {
		return;
	}

	let guild = client.guilds.get("226534113329283072");
	let now = Date.now();

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.timestampEnd != -1) {
			if(now >= parseInt(data.timestampEnd)) {
				let victim = guild.members.get(data.member);

				if(victim) {
					if(victim.roles.get("478326753790787596")) {
						victim.roles.remove("478326753790787596");
						victim.send("Your mute in Blockland Content Creators has ended.");
					}
				}

				console.log("ended mute for member ID " + data.member);

				muteData.splice(idx, 1);
				fs.writeFileSync("./mutes.json", JSON.stringify(muteData), "utf-8");
			}
		}
	}
}
var muteTickInterval = setInterval(muteTick, 5000);

function tmpMsgTick() {
	if(!tmpMsgData.length) {
		return;
	}

	let guild = client.guilds.get("226534113329283072");
	let now = Date.now();

	for(let idx in tmpMsgData) {
		let data = tmpMsgData[idx];

		let channel = guild.channels.get(data.channelid)

		if(now >= parseInt(data.timestampEnd)) {
			let msg = channel.messages.get(data.msgid);
			if(msg) {
				msg.delete();
			}

			tmpMsgData.splice(idx, 1);
			fs.writeFileSync("./tmpMsgs.json", JSON.stringify(tmpMsgData), "utf-8");
		}
	}
}
var tmpMsgTickInterval = setInterval(tmpMsgTick, 60000);

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

		case "staff":
		case "general-commands":
		case "test":
			handleGeneralCommand(msg);
			break;

		case "voice-text":
		case "radio-bot":
			handleTempChannel(msg);
			break;
	}
});

client.on("guildMemberAdd", function(member) {
	let now = Date.now();

	for(let idx in muteData) {
		let data = muteData[idx];

		if(data.member == member.id) {
			if(data.timestampEnd == -1 || now < parseInt(data.timestampEnd)) {
				member.roles.add("478326753790787596");
			}
		}
	}	
});

client.login(settings.token);
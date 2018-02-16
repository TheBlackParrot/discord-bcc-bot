const discord = require("discord.js");
const client = new discord.Client();

const settings = require("./settings.json");

client.on("ready", function() {
	console.log("ready, logged in as " + client.user.tag);
});

client.on("message", function(msg) {
	if(msg.author.id == client.user.id) {
		return;
	}

	function deleteMsg() {
		msg.delete({timeout: 10000});
	}
	function deleteReply(reply) {
		reply.delete({timeout: 10000});
	}
	function deleteMsgAndReply(reply) {
		deleteMsg();
		deleteReply(reply);
	}

	var content = msg.cleanContent;
	var prefix = content.substr(0, 1);

	switch(prefix) {
		case "+":
			if(!(settings.allowed_channels.includes(msg.channel.name))) {
				console.log("not allowed in " + msg.channel.name);
				break;
			}
			
			var role = content.substr(1);
			
			if(!(settings.allowed_roles.includes(role))) {
				msg.reply("`" + role + "` is not a toggleable role.")
						.then(deleteMsgAndReply);
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.roles.add(roles.find("name", role));
			msg.reply("You now have the `" + role + "` role.")
					.then(deleteMsgAndReply);

			break;

		case "-":
			if(!(settings.allowed_channels.includes(msg.channel.name))) {
				console.log("not allowed in " + msg.channel.name);
				break;
			}
			
			var role = content.substr(1);
			
			if(!(settings.allowed_roles.includes(role))) {
				msg.reply("`" + role + "` is not a toggleable role.")
						.then(deleteMsgAndReply);
				break;
			}

			var member = msg.member;
			var roles = msg.guild.roles;

			member.roles.remove(roles.find("name", role));
			msg.reply("You no longer have the `" + role + "` role.")
					.then(deleteMsgAndReply);

			break;

		case "!":
			var cmds = content.substr(1).split(" ");
			
			switch(cmds[0]) {
				case "purge":

					var num = parseInt(cmds[1]);
					if (num === NaN || num <= 0) {
						msg.reply("`purge` requires a valid positive number")
								.then(deleteMsgAndReply);
						break;
					}
					
					// Make sure user got sufficient permission
					if (!msg.member.permissions.has(Permissions.FLAGS.MANAGE_MESSAGES)) {
						console.log("try of purging in " + msg.channel.name + " by " + msg.author.username);
						break;
					}

					// Removing the command as well
					++num;

					// Fetch, delete and notify
					msg.channel.fetchMessages({limit: num})
							.then(function(messages) {
						var channel = msg.channel;
						msg.channel.bulkDelete(messages)
								.then(function(messages) {
							channel.reply("Purged " + messages.size + " messages")
									.then(deleteReply);
						});
					});

					break;
			}
			break;

		default:
			/* specific case here */
			if(msg.channel.name == "role-request") {
				if(!(["+", "-", "!"].includes(prefix)) && msg.author.id != client.user.id) {
					msg.delete();
				}
			}
			return;
	}
});

client.login(settings.token);
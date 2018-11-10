/**************/
/*** CONFIG ***/
/**************/
var PORT = 3000
var ROOM = null
/*************/
/*** SETUP ***/
/*************/

var express = require("express")
var http = require("http")
var bodyParser = require("body-parser")
var main = express()

main.set("view engine", "ejs")
main.set("views", "./views")
main.use(express.static("public"))

var server = http.createServer(main)
var io = require("socket.io").listen(server)

server.listen(process.env.PORT || PORT, null, function() {
	// console.log("Listening on port " + process.env.PORT || PORT)
})

main.get("/", (req, res) => res.render("index"))
main.get("/room/:roomName", (req, res) => {
    ROOM = req.params.roomName
    res.render("room")
})

/*************************/
/*** INTERESTING STUFF ***/
/*************************/

var channels = {} // Temp
var sockets = {} // Temp

/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' event they'll begin
 * setting up on RTCPeerConnection with one onother. During this process they'll
 * need to relay ICECandidate infomation to one onother, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother
 */

io.sockets.on("connection", (socket) => {

    /**
     * Init global
     */
	socket.channel = null
	sockets[socket.id] = socket

	// console.log("["+ socket.id + "] connection accepted")
	socket.on("disconnect", () => {

        /**
         * Remove socket in each channel
         */
		
        part(socket.channel)

		// console.log("["+ socket.id + "] disconnected")

        /**
         * Remove socket in sockets variable
         */
        delete sockets[socket.id]   

	})

	socket.on("join", (config) => {

		// console.log("["+ socket.id + "] join ", config)
        /**
         * Config from Client
         * channel, userdata
         */
		var channel = config.channel
		var userdata = config.userdata

        /**
         * Giới hạn 4 người
         */
        var count = 0
        for(s in channels[channel]) {
            count = count + 1;
        }
        if(count < 4) {
            /**
             * Already join channel
             */

            if(socket.channel) {
                 // console.log("["+ socket.id + "] ERROR: already joined ", socket.channel)
                return ;
            }
            /**
             * If channel not in channels
             * Create new channel in server
             */
            if (!(channel in channels)) {
                channels[channel] = {}
            }
         
            /**
             * Emit all peers in channel: event new peer created
             * Emit to socket: create new peer
             */
            for (id in channels[channel]) {
                channels[channel][id].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false})
                socket.emit('addPeer', {'peer_id': id, 'should_create_offer': true})
            }

            /**
             * Add socket to channel
             * socket.id => socket
             */
            channels[channel][socket.id] = socket

            /**
             * Add property channels to socket (name channel)
             */
            socket.channel = channel
        } else {
            socket.emit("channelFull", config )
        }

	})

    /**
     * Listen emit Offer from client socket.
     * peer_id: peer want to add
     * session_description (local description)
     * Server nhận được relaySessionDescription từ A. Tại đây Server sẽ tiến hành kiểm tra B có đang trong channel
     * không. Sau đó gửi B description của A.
     * sessionDescription emit to B
     */
    socket.on("relaySessionDescription", (config) => {
        var peer_id = config.peer_id
        var session_description = config.session_description
        // console.log("["+ socket.id + "] relaying session description to [" + peer_id + "] ", session_description)

        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription', {'peer_id': socket.id, 'session_description': session_description});
        }
    })

    /**
     * Nhận ICE candidate từ client A.
     * Gửi về cho peer_id mà A cần kết nối
     */
    socket.on("relayICECandidate", (config) => {
        var peer_id = config.peer_id
        var ice_candidate = config.ice_candidate
        // console.log("["+ socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate)
        if(peer_id in sockets) {
            sockets[peer_id].emit("iceCandidate", {"peer_id": socket.id, "ice_candidate": ice_candidate})
        }
    })

    socket.on("client-send-message", (data) => {
        // console.log(socket.id + " send message in " + socket.channel)
        var channel = data.channel
        var mess = data.mess
        var dataImage = data.dataImage
        for(id in channels[channel]) {
            if(id != socket.id) {
                channels[channel][id].emit("server-send-message", { 'peer_id': socket.id, "mess": mess, "dataImage": dataImage })
            }
        }
        socket.emit("server-send-my-message", {"mess": mess, "dataImage": dataImage})
    })


	function part(channel) {
        // console.log("["+ socket.id + "] part ");

        if(!socket.channel) {
            // console.log("["+ socket.id + "] ERROR: not in ", channel);
            return;
        }

        /**
         * Remove channel in socket
         * Remove socket in channels[channel]
         */
        socket.channel = null;
        delete channels[channel][socket.id];

        /**
         * Emit all peers in channel: event peer disconnected
         * Emit to socket: disconnected
         */
        for (id in channels[channel]) {
            channels[channel][id].emit('removePeer', {'peer_id': socket.id});
            socket.emit('removePeer', {'peer_id': id});
        }
    }
})
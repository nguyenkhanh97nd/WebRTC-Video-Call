const $ = require('jquery')

var SIGNALING_SERVER = "http://localhost:3000"
var USE_AUDIO = true
var USE_VIDEO = true
var INPUT_CHANNEL = null
var MUTE_AUDIO_BY_DEFAULT = false


/**
 * In list stun server
 */
var ICE_SERVERS = [
    {url:"stun:stun.l.google.com:19302"}
]

var signaling_socket = null
var local_media_stream = null
var peers = {} // Temp
var peer_media_elements = {}

function init() {
	console.log("Connect to signaling server")
	signaling_socket = io()
	signaling_socket.on("connect", () => {
		console.log("Connected to signaling server")
		setup_local_media(() => {
			join_chat_channel(INPUT_CHANNEL, {'whatever-you-want-here': 'stuff'}) // TODO
		})
	})
	signaling_socket.on("disconnect", () => {
		console.log("Disconnected from signaling server")
		for (peer_id in peer_media_elements) {
             peer_media_elements[peer_id].remove();
         }
         for (peer_id in peers) {
             peers[peer_id].close()
         }
         peers = {}
         peer_media_elements = {}
 	})
 	signaling_socket.on("addPeer", (config) => {
 		console.log('Signaling server said to add peer:', config)
 		/**
 		 * peer_id
 		 * should_create_offer
 		 */
 		var peer_id = config.peer_id
 		if(peer_id in peers) {
 			console.log("Already connected to peer ", peer_id);
            return;
 		}
 		var peer_connection = new RTCPeerConnection(
 			{"iceServers": ICE_SERVERS},
 			{"optional": [{"DtlsSrtpKeyAgreement": true}]} // for Chrome and Firefox to interoperate
 		)

 		peers[peer_id] = peer_connection // save RTCPeerConnection object


 		/**
 		 * Gửi dữ liệu lên ICE Server
 		 */
 		peer_connection.onicecandidate = (event) => {
 			if(event.candidate) {
 				signaling_socket.emit("relayICECandidate", {
 					"peer_id": peer_id,
 					"ice_candidate": {
 						"sdpMLineIndex": event.candidate.sdpMLineIndex,
 						"candidate": event.candidate.candidate
 					}
 				})
 			}
 		}

 		/**
 		 * Khi nhận được video.
 		 */
 		peer_connection.onaddstream = (event) => {
 			console.log("onAddStream", event)
 			var remote_media = USE_VIDEO ? $("<video class='col-md-5 remote-media'>") : $("<audio class='col-md-5'>")
 			remote_media.attr("autoplay", "autoplay")
 			if (MUTE_AUDIO_BY_DEFAULT) {
                remote_media.attr("muted", "true")
                remote_media[0].muted = true
            }
            // remote_media.attr("controls", "")
            peer_media_elements[peer_id] = remote_media
            $("#content").append(remote_media)
            attachMediaStream(remote_media[0], event.stream)
 		}

 		/**
 		 * Add our local stream
 		 * Thêm stream của socket vào ICEServer.
 		 */
 		 peer_connection.addStream(local_media_stream)


 		 /**
 		  * Create Offer if addPeer config emit by current socket
 		  * Offer is local description.
 		  * Tạo offer gửi cho Peer cần kết nối.
 		  * A vào web. trong room có B. A muốn kết nối đến B
 		  * A gửi offer kèm description của mình cho B.
 		  * relaySessionDescription emit lên Server.
 		  */
 		 if(config.should_create_offer) {
 		 	console.log("Creating RTC offer to ", peer_id)
 		 	peer_connection.createOffer(
 		 		(local_description) => {
 		 			console.log("Local offer description is: ", local_description)
 		 			peer_connection.setLocalDescription(local_description, () => {
 		 				signaling_socket.emit("relaySessionDescription", {"peer_id": peer_id, "session_description": local_description})
 		 				console.log("Offer setLocalDescription succeeded")
 		 			}, () => {
 		 				alert("Offer setLocalDescription failed!")
 		 			})
 		 		},
 		 		(error) => {
 		 			console.log("Error sending offer: ", error)
 		 		}
 		 	)
 		 }

 	})

 	/**
 	 * B lắng nghe sessionDescription từ Server gửi lên.
 	 * B nhận được thông tin của A.
 	 * Nếu type của A là offer thì B tiến hành tạo Answer và gửi lên Server.
 	 * relaySessionDescription emit to Server thông tin của B.
 	 * Trên Server nhận và gửi sessionDescription về. Tuy nhiên type lúc này không phải là offer nữa mà
 	 * là answer. nên quá trình kết thúc.
 	 */
 	signaling_socket.on("sessionDescription", (config) => {
 		console.log('Remote description received: ', config)
 		var peer_id = config.peer_id
 		var peer = peers[peer_id]
 		var remote_description = config.session_description
 		console.log(config.session_description)

 		var desc = new RTCSessionDescription(remote_description)

 		var stuff = peer.setRemoteDescription(desc, () => {
 			console.log("setRemoteDescription succeeded")
 			if (remote_description.type == "offer") {
 				console.log("Creating answer")
 				peer.createAnswer((local_description) => {
 					console.log("Answer description is: ", local_description)
 					peer.setLocalDescription(local_description, () => {
 						
 						signaling_socket.emit('relaySessionDescription', {'peer_id': peer_id, 'session_description': local_description})
 						
 						console.log("Answer setLocalDescription succeeded")
 					}, () => alert("Answer setLocalDescription failed!"))
 				}, (error) => {
 					console.log("Error creating answer: ", error)
                    console.log(peer)
 				})
 			}
 		}, (error) => console.log("setRemoteDescription error: ", error) )

 		console.log("Description Object: ", desc)
 	})

 	signaling_socket.on("removePeer", (config) => {
 		console.log('Signaling server said to remove peer:', config)
 		var peer_id = config.peer_id
 		if(peer_id in peer_media_elements) {
 			peer_media_elements[peer_id].remove()
 		}
 		if(peer_id in peers) {
 			peers[peer_id].close()
 		}

 		delete peers[peer_id]
 		delete peer_media_elements[peer_id]
 	})

 	/**
     * The offerer will send a number of ICE Candidate blobs to the answerer so they 
     * can begin trying to find the best path to one another on the net.
     * Server trả về ICE Candidate của A
     * B nhận được thì add ICE Candidate.
     */
    signaling_socket.on('iceCandidate', function(config) {
        var peer = peers[config.peer_id];
        var ice_candidate = config.ice_candidate;
        peer.addIceCandidate(new RTCIceCandidate(ice_candidate));
    })

    signaling_socket.on("channelFull", (config) => {
    	var channel = config.channel
    	alert("Room full")
    	window.location.href = '/'
    })

 	function setup_local_media(callback, errorback) {
 		if(local_media_stream != null) {
 			if(callback) callback()
 			return;
 		}

 		console.log("Requesting access to local audio / video")

 		navigator.getUserMedia = (navigator.getUserMedia || 
 					   navigator.webkitGetUserMedia ||
                       navigator.mozGetUserMedia ||
                       navigator.msGetUserMedia)

 		navigator.getUserMedia({ "audio": USE_AUDIO, "video": USE_VIDEO }, (stream) => {
 			console.log("Access granted to audio / video")
 			local_media_stream = stream
 			var local_media = USE_VIDEO ? $("<video class='col-md-5 local-media'>") : $("<audio class='col-md-5'>")
 			local_media.attr("autoplay", "autoplay")
 			local_media.attr("muted", "true")
 			// local_media.attr("controls", "")
 			$("#content").append(local_media)

 			local_media[0].muted = true
 			attachMediaStream(local_media[0], stream)

            $(".cam").click(() => {
                if(stream.getVideoTracks()[0].enabled) {
                    stream.getVideoTracks()[0].enabled = false
                    $(".cam").css("background", "#f1004c")
                } else {
                    stream.getVideoTracks()[0].enabled = true
                    $(".cam").css("background", "none")
                }
            })
            $(".mic").click(() => {
                if(stream.getAudioTracks()[0].enabled) {
                    stream.getAudioTracks()[0].enabled = false
                    $(".mic").css("background", "#f1004c")
                } else {
                    stream.getAudioTracks()[0].enabled = true
                    $(".mic").css("background", "none")
                }
            })


 			if(callback) callback()

 		}, () => {
 			console.log("Access denied for audio / video")
 			alert("Can't work")
 			if(errorback) errorback()
 		})

 		attachMediaStream = (element, stream) => {
 			console.log("DEPRECATED, attachMediaStream will soon be removed.")
 			element.srcObject = stream

 		}

 	}

 	function join_chat_channel(channel, userdata) {
 		signaling_socket.emit("join", {"channel": channel, "userdata": userdata})
 	}


    signaling_socket.on("server-send-message", (data) => {
       
        var peer_id = data.peer_id
        var mess = data.mess
        var dataImage = data.dataImage
        var name = data.peer_name || "Guest"
        $(".chat-history").append("<div class='chat-message clearfix'><div class='chat-message-content clearfix yourmess'><img src='" + dataImage +"' width='32' height='32'><h5>" + name + "</h5><p>"+ mess +"</p></div></div><hr>")
        $(".chat-history")[0].scrollTop = $(".chat-history")[0].scrollHeight
        
    })

    signaling_socket.on("server-send-my-message", (data) => {
        
        var mess = data.mess
        var dataImage = data.dataImage
        var name = data.peer_name || "Guest"
        $(".chat-history").append("<div class='chat-message clearfix'><div class='chat-message-content clearfix mymess'><img src='" + dataImage +"' width='32' height='32'><h5>" + name + "</h5><p>"+ mess +"</p></div></div><hr>")
        $(".chat-history")[0].scrollTop = $(".chat-history")[0].scrollHeight
    })

     /**
     * Funtions client
     */

    $(".type-message").keyup((e) => {
        if(e.keyCode == 13) {
            var mess = $.trim($(".type-message").val())
            if(mess.length > 0) {

                var dataImage = null
                var width = 300
                var height = 300
                var canvas = $("canvas")[0]
                canvas.width = width
                canvas.height = height
                var context = canvas.getContext('2d')
                
                context.drawImage($(".local-media")[0], 0, 0, width, height)
                dataImage = canvas.toDataURL('image/jpeg')

                signaling_socket.emit("client-send-message", {'channel': INPUT_CHANNEL, "mess": mess, "dataImage": dataImage})
                $(".type-message").val("")
            }
        }
    })

    $(".leave").click(() => {
        window.location.href = "/"
    })
   
    $(".view-all").click(() => {
        alert("Soon")
    })
    $(".stickers").click(() => {
        alert("Soon")
    })
    /**
     * END functions
     */
}

/**
 * Lấy room từ PATH
 */

var PATH_NAME = window.location.pathname
if(PATH_NAME) {

	var path_split = PATH_NAME.split("/")
	
	if( /^([a-z0-9]{1,60})$/.test(path_split[2]) ) {
		var room = path_split[2]
		INPUT_CHANNEL = room
		$(".room-name").html(INPUT_CHANNEL)
		init()

	} else {
		window.location.href = "/"
	}
}
function activeEnter(e) {
    if(document.getElementsByClassName("input-room")[0].value.length) {
        document.getElementsByClassName("input-submit")[0].removeAttribute("disabled")
        document.getElementsByClassName("input-submit")[0].setAttribute("style", "color: #f1004c")
        if(e.keyCode == 13) {
        	window.location.href = "/room/" + document.getElementsByClassName("input-room")[0].value
        }

    } else {
        document.getElementsByClassName("input-submit")[0].setAttribute("disabled", "true")
        document.getElementsByClassName("input-submit")[0].setAttribute("style", "color: #333")
    }

}

document.getElementsByClassName("input-submit")[0].addEventListener('click', function() {
    window.location.href = "/room/" + document.getElementsByClassName("input-room")[0].value
})
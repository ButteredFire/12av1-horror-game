import { Engine } from "./Client/Engine"


window.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById("start-button");
    const input = document.getElementById("username-input");
    const screen = document.getElementById("login-screen");

    startBtn.addEventListener("click", () => {
        const name = input.value;
        screen.style.display = "none";
        
        const engine = new Engine(name);
        engine.start();
    });
});

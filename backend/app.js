import { useState, useEffect } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

function App() {
  const [user, setUser] = useState("User1");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    return () => {
      socket.off("receive_message");
    };
  }, []);

  const sendMessage = () => {
    if (message.trim() === "") return;
    const data = { user, message };
    socket.emit("send_message", data);
    setMessages((prev) => [...prev, data]);
    setMessage("");
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h2>Chat Teste WebSocket</h2>

      <div style={{ marginBottom: "10px" }}>
        <strong>Selecionar utilizador:</strong>
        <select
          value={user}
          onChange={(e) => setUser(e.target.value)}
          style={{ marginLeft: "10px" }}
        >
          <option value="User1">User1</option>
          <option value="User2">User2</option>
        </select>
      </div>

      <div
        style={{
          border: "1px solid #ccc",
          padding: "10px",
          height: "300px",
          overflowY: "auto",
          marginBottom: "10px",
        }}
      >
        {messages.map((msg, idx) => (
          <div key={idx}>
            <strong>{msg.user}:</strong> {msg.message}
          </div>
        ))}
      </div>

      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Escreve uma mensagem"
        style={{ width: "70%", marginRight: "10px" }}
      />
      <button onClick={sendMessage}>Enviar</button>
    </div>
  );
}

export default App;

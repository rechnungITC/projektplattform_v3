declare module "ws" {
  const WebSocketImpl: typeof WebSocket

  export default WebSocketImpl
}

// The peek (M5-13): <PeekHost /> is mounted once in the shell; views open it through the store.

export { PeekHost } from './PeekHost';
export {
  closePeek,
  isPeekOpen,
  movePeek,
  openPeek,
  type PeekRequest,
  togglePeek,
  usePeek,
} from './store';

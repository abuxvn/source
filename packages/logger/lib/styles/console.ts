import {
  bold,
  italic,
  underline,
  // colors
  black,
  bgBlack,
  gray,
  bgBlackBright as bgGray,
  red,
  redBright,
  bgRed,
  bgRedBright,
  white,
  whiteBright,
  // text util colors
  green,
  greenBright,
  yellow,
  yellowBright,
  blue,
  blueBright,
  cyan,
  cyanBright,
  magenta,
  magentaBright,
  // badge util bg colors
  bgGreen,
  bgGreenBright,
  bgYellow,
  bgYellowBright,
  bgBlue,
  bgBlueBright,
  bgCyan,
  bgCyanBright,
  bgMagenta,
  bgMagentaBright
} from 'ansi-colors'
import type { IStyles } from './interfaces'

export { enabled, unstyle } from 'ansi-colors'
export const styles: IStyles = {
  bold,
  italic,
  underline,
  // colors
  black,
  bgBlack,
  gray,
  bgGray,
  red,
  redBright,
  bgRed,
  bgRedBright,
  white,
  whiteBright,
  // text util colors
  green,
  greenBright,
  yellow,
  yellowBright,
  blue,
  blueBright,
  cyan,
  cyanBright,
  magenta,
  magentaBright,
  // badge util bg colors
  bgGreen,
  bgGreenBright,
  bgYellow,
  bgYellowBright,
  bgBlue,
  bgBlueBright,
  bgCyan,
  bgCyanBright,
  bgMagenta,
  bgMagentaBright
} as unknown as IStyles

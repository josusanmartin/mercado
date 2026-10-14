// Mercado mobile kit: the in-phone apps (structure: crew/mobile.md v2; style: crew/PRINCIPLES.md).
//   <PhoneFrame accent="#E2603F" theme="paper" | "ink">…</PhoneFrame> (from @/components/console) wraps an app.
//   Type: <Display> (Archivo Black, uppercase) for balances/titles, <Meta> for tiny uppercase labels.
//   Inside: TopAppBar, ListItem, Button, Chip, BottomSheet, NumericKeypad, BottomNav, SuccessScreen, …
//   useSnackbar()("Copiado") shows a snackbar; ScreenTransition + useNavDirection give M3 motion.
export { AndroidDevice, InPhone, useOverlayHost, useSnackbar } from "./device";
export {
  AppHeader,
  Avatar,
  APP_HONESTY,
  BalanceHead,
  Banner,
  BottomNav,
  Button,
  Chip,
  Display,
  DemoBadge,
  DetailRows,
  EmptyState,
  Fab,
  HonestyNote,
  IconButton,
  LinearProgress,
  ListHeader,
  ListItem,
  Meta,
  Money,
  Pressable,
  RoundAction,
  Rule,
  ScreenTransition,
  Skeleton,
  SkeletonList,
  SuccessCheck,
  SuccessScreen,
  Switch,
  TickUp,
  useTickUp,
  TopAppBar,
  ripple,
  useNavDirection,
  type NavItem,
} from "./primitives";
export { BottomSheet } from "./sheet";
export { NumericKeypad, nextAmount } from "./keypad";
export { BrandLogo, BrandTile, ConsentSheet, PlatformButton, brandName, type BrandId } from "./brands";
export { fmtMoney, fmtTyping, haceTiempo, haptic, initials } from "./format";
export { PhonePanel } from "./phone-panel";

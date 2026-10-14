// Mercado mobile kit (crew/mobile.md): Material 3-inspired Android UI for every in-phone experience.
//   <PhoneFrame accent="#ff8a1f">…</PhoneFrame>  (from @/components/console) wraps an app in AndroidDevice.
//   Inside: TopAppBar, ListItem, Button, Chip, BottomSheet, NumericKeypad, BottomNav, SuccessScreen, …
//   useSnackbar()("Copiado") shows a snackbar; ScreenTransition + useNavDirection give M3 motion.
export { AndroidDevice, InPhone, useOverlayHost, useSnackbar } from "./device";
export {
  Avatar,
  Banner,
  BottomNav,
  Button,
  Chip,
  DemoBadge,
  DetailRows,
  EmptyState,
  Fab,
  HonestyNote,
  IconButton,
  LinearProgress,
  ListHeader,
  ListItem,
  Pressable,
  ScreenTransition,
  Skeleton,
  SkeletonList,
  SuccessCheck,
  SuccessScreen,
  Switch,
  TopAppBar,
  ripple,
  useNavDirection,
  type NavItem,
} from "./primitives";
export { BottomSheet } from "./sheet";
export { NumericKeypad, nextAmount } from "./keypad";
export { BrandLogo, BrandTile, ConsentSheet, PlatformButton, brandName, type BrandId } from "./brands";
export { fmtMoney, fmtTyping, haceTiempo, haptic, initials } from "./format";

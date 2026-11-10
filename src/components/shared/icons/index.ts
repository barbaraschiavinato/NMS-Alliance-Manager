// The only place that picks what each concept looks like. Components import icons by meaning from here,
// never from `lucide-react` (an ESLint rule enforces it): to change an icon, change the line below.
// Named exports keep tree-shaking, so a page only bundles the icons it renders.

import type { LucideIcon } from "lucide-react";
import { sectionIcons, specialtyIcons } from "./icon-maps";

export type IconComponent = LucideIcon;

// Sections and navigation (the section and specialty icons come from icon-maps.ts, their single source)
export const StationIcon = sectionIcons.stations;
export const MissionIcon = sectionIcons.missions;
export const PlanetIcon = sectionIcons.planets;
export const MapIcon = sectionIcons.map;
export const FarmIcon = sectionIcons.farms;
export const PetIcon = sectionIcons.pets;
export {
  Trophy as LeaderboardIcon,
  CarTaxiFront as TaxiIcon,
  Mail as MessagesIcon,
  Siren as HelpRequestIcon,
  BookOpen as GuideIcon,
  UsersRound as UsersIcon,
  UserRoundX as OfflinePlayersIcon,
  Radar as NotFoundIcon,
} from "lucide-react";

// Specialties
export const RangerIcon = specialtyIcons.ranger;
export const ExplorerIcon = specialtyIcons.explorer;
export const BuilderIcon = specialtyIcons.builder;

// Common actions
export {
  CirclePlus as AddIcon,
  Plus as ConfirmAddIcon,
  Pencil as EditIcon,
  Trash2 as DeleteIcon,
  X as CloseIcon,
  Check as CheckIcon,
  ArrowUpRight as SubmitIcon,
  ArrowLeft as BackIcon,
  Search as SearchIcon,
  SlidersHorizontal as FiltersIcon,
  RotateCcw as ResetIcon,
  FileSpreadsheet as ExportIcon,
  ImagePlus as AddImageIcon,
  Send as SendIcon,
  Reply as ReplyIcon,
  MessageSquareText as WriteMessageIcon,
  MailCheck as MarkReadIcon,
  Archive as ArchiveIcon,
  ArchiveRestore as RestoreIcon,
  ChevronDown as ExpandedIcon,
  ChevronRight as CollapsedIcon,
  ChevronDown as DropdownIcon,
  ChevronLeft as PreviousPageIcon,
  ChevronRight as NextPageIcon,
  Eye as ShowingAllIcon,
  EyeOff as ShowingMineIcon,
  Plus as ZoomInIcon,
  Minus as ZoomOutIcon,
  Scan as FitMapIcon,
} from "lucide-react";

// Missions and stations
export {
  CirclePlus as CreateMissionIcon,
  CirclePlus as CreateStationIcon,
  RotateCcw as ReopenIcon,
  ShieldPlus as SpecialistRequestIcon,
  FileText as NotesIcon,
  Info as InfoIcon,
  Info as PlanetNotesIcon,
  AlertTriangle as GalaxyWarningIcon,
  ArrowLeft as RemoveGlyphIcon,
} from "lucide-react";

// Planets
export {
  Globe2 as PlanetPlaceholderIcon,
  Moon as MoonIcon,
  Palmtree as ParadiseIcon,
  AudioWaveform as DissonantIcon,
  Skull as BlackMarketIcon,
  Leaf as FloraIcon,
  PawPrint as FaunaIcon,
  Gem as MineralsIcon,
  MapPin as CoordinatesIcon,
  Aperture as BlackHoleIcon,
} from "lucide-react";
export { AtlasIcon, GasGiantIcon, WaterLevelIcon } from "./custom-icons";

// Farms and pets
export { Sprout as PlantsIcon, Pickaxe as MaterialsIcon, Egg as EggTradeIcon } from "lucide-react";
export { PetTypeIcon } from "./pet-type-icon";
export { petTypeIcons, type PetTypeIconDefinition, type PetTypeIconPath } from "./pet-type-icons";

// Members, account and administration
export {
  UserRound as ProfileIcon,
  UserRoundPlus as JoinIcon,
  LogOut as SignOutIcon,
  LayoutList as SimpleViewIcon,
  Settings2 as AllianceSettingsIcon,
  ShieldCheck as AllianceIdentityIcon,
  Languages as LanguageIcon,
  Check as ApproveIcon,
  CircleX as RevokeApprovalIcon,
  UserRoundCheck as UnblockIcon,
  Ban as BlockIcon,
  Bell as NotificationsIcon,
  UserCheck as MemberNotificationsIcon,
} from "lucide-react";

// Status and feedback
export {
  CircleAlert as AlertIcon,
  CheckCircle2 as ReadyIcon,
  Orbit as LoadingIcon,
  Orbit as AllianceLogoIcon,
} from "lucide-react";

// Brands
export { Send as TelegramIcon } from "lucide-react";
export { DiscordIcon, GoogleIcon } from "./custom-icons";

// Race marks used as CSS masks (files in public/icons/). The Gek mark doubles as the default app icon.
export const raceIconPaths = {
  Gek: "/icons/nms-gek.svg",
  Korvax: "/icons/nms-korvax.svg",
  "Vy’keen": "/icons/nms-vykeen.svg",
} as const;

export const defaultAppIconPath = raceIconPaths.Gek;

export { sectionIcons, specialtyIcons };

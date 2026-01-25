/**
 * Icon Component
 *
 * Reusable icon component using Lucide Icons
 * Automatically applies portal/tool colors
 */

import { Component, Input } from '@angular/core';
import { LucideAngularModule, Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
  ClipboardList, ClipboardCheck, FileText, File, Folder,
  Mail, MessageSquare, Phone, User, Users,
  UserCheck, UserPlus, Briefcase, Clipboard, Settings,
  Wrench, CheckSquare, ListTodo, MapPin,
  BarChart, PieChart, TrendingUp, DollarSign, CreditCard,
  ShoppingCart, Package, Truck, Home, Building,
  Store, Heart, Star, Bell, BookOpen,
  GraduationCap, Video, Mic, Camera, Image,
  FileCheck, FilePlus, Download, Upload, Search,
  Filter, Circle, ChevronRight, LogOut, AlertCircle, Inbox
} from 'lucide-angular';

// Map of available icons
const ICON_MAP = {
  Calendar, CalendarCheck, CalendarClock, CalendarDays, Clock,
  ClipboardList, ClipboardCheck, FileText, File, Folder,
  Mail, MessageSquare, Phone, User, Users,
  UserCheck, UserPlus, Briefcase, Clipboard, Settings,
  Wrench, CheckSquare, ListTodo, MapPin,
  BarChart, PieChart, TrendingUp, DollarSign, CreditCard,
  ShoppingCart, Package, Truck, Home, Building,
  Store, Heart, Star, Bell, BookOpen,
  GraduationCap, Video, Mic, Camera, Image,
  FileCheck, FilePlus, Download, Upload, Search,
  Filter, Circle, ChevronRight, LogOut, AlertCircle, Inbox
};

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <lucide-icon
      [img]="iconComponent"
      [class]="customClass"
      [size]="size"
      [strokeWidth]="strokeWidth"
    ></lucide-icon>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    lucide-icon {
      display: inline-flex;
    }
  `]
})
export class IconComponent {
  @Input() set name(value: string | undefined) {
    // Get icon from map or use Circle as fallback
    this.iconComponent = (value && value in ICON_MAP)
      ? ICON_MAP[value as keyof typeof ICON_MAP]
      : Circle;
  }

  @Input() size: number = 24;
  @Input() strokeWidth: number = 2;
  @Input() customClass: string = '';

  protected iconComponent: any = Circle;
}

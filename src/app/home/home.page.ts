import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy
} from '@angular/core';
import * as L from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import { Platform } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('map', { static: false }) mapElement!: ElementRef;

  map!: L.Map;
  polyline!: L.Polyline;
  marker!: L.Marker;
  coords: L.LatLng[] = [];
  intervalId: any;
  maxPoints: number = 15;
  isTracking: boolean = false;

  constructor(private platform: Platform) {}

  ngOnInit() {}

  async ngAfterViewInit() {
    await this.platform.ready();
    setTimeout(() => this.initMap(), 300);
  }

  async initMap() {
    L.Icon.Default.imagePath = 'assets/leaflet/';

    const customIcon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon.png',
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
      iconSize: [18, 30],
      iconAnchor: [9, 30],
      popupAnchor: [1, -25],
      shadowSize: [30, 30]
    });

    this.map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.polyline = L.polyline([], { color: 'blue', weight: 5 }).addTo(this.map);

    setTimeout(() => this.map.invalidateSize(), 300);

    const rutaGuardada = localStorage.getItem('rutaGuardada');
    if (rutaGuardada) {
      const puntos = JSON.parse(rutaGuardada);
      this.coords = puntos.map((p: any) => L.latLng(p.lat, p.lng));
      this.polyline.setLatLngs(this.coords);

      if (this.coords.length > 0) {
        this.map.setView(this.coords[this.coords.length - 1], 16);

        this.coords.forEach((p: L.LatLng, index: number) => {
          const marker = L.marker(p, { icon: customIcon }).addTo(this.map);

          if (index === 0) {
            marker.bindPopup('Mi Casa');
            marker.on('click', () => {
              marker.openPopup();
            });
          } else if (index === this.coords.length - 1 && this.coords.length >= this.maxPoints) {
            marker.bindPopup('Destino');
            marker.on('click', () => {
              marker.openPopup();
            });
          }
        });
      }
    }

    try {
      await this.requestLocationPermission();

      if (this.coords.length < this.maxPoints) {
        await this.centerMapOnCurrentLocation(customIcon);
        this.startTracking(customIcon);
      } else {
        this.markLastPointAsDestination(customIcon);
      }
    } catch (error) {
      console.error('Error al inicializar ubicación:', error);
    }
  }

  async requestLocationPermission() {
    try {
      const permissionStatus = await Geolocation.checkPermissions();
      if (permissionStatus.location !== 'granted') {
        const result = await Geolocation.requestPermissions();
        if (result.location !== 'granted') {
          throw new Error('Permiso de ubicación no concedido');
        }
      }
    } catch (error) {
      console.error('Error al solicitar/verificar permisos de ubicación:', error);
      throw error;
    }
  }

  async centerMapOnCurrentLocation(icon: L.Icon) {
    try {
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000
      });

      const { latitude, longitude } = position.coords;
      const currentPos = L.latLng(latitude, longitude);
      this.map.setView(currentPos, 16);

      this.marker = L.marker(currentPos, { icon }).addTo(this.map)
        .bindPopup('Mi Casa')
        .openPopup();

      if (this.coords.length < this.maxPoints) {
        this.coords.push(currentPos);
        this.polyline.addLatLng(currentPos);
        localStorage.setItem('rutaGuardada', JSON.stringify(this.coords));
      }

      return currentPos;
    } catch (error) {
      console.error('Error al obtener ubicación:', error);
      throw error;
    }
  }

  startTracking(icon: L.Icon) {
    if (this.isTracking || this.coords.length >= this.maxPoints) return;

    this.isTracking = true;

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      if (this.coords.length >= this.maxPoints) {
        this.markLastPointAsDestination(icon);
        return;
      }

      try {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000
        });

        const { latitude, longitude } = position.coords;
        const newPos = L.latLng(latitude, longitude);

        if (this.coords.length < this.maxPoints) {
          L.marker(newPos, { icon }).addTo(this.map);
          this.coords.push(newPos);
          this.polyline.addLatLng(newPos);
          localStorage.setItem('rutaGuardada', JSON.stringify(this.coords));
          this.map.panTo(newPos);

          console.log(`Punto ${this.coords.length}:`, latitude, longitude);
        }
      } catch (error) {
        console.error('Error al obtener nueva posición:', error);
      }
    }, 60000); // Cada 1 minuto
  }

  stopTracking() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isTracking = false;
  }

  resetTracking() {
    if (!confirm('¿Estás seguro de reiniciar la ruta?')) return;

    this.stopTracking();
    this.coords = [];
    this.polyline.setLatLngs([]);

    if (this.marker) {
      this.marker.remove();
    }

    localStorage.removeItem('rutaGuardada');

    const customIcon = L.icon({
      iconUrl: 'assets/leaflet/marker-icon.png',
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
      iconSize: [18, 30],
      iconAnchor: [9, 30],
      popupAnchor: [1, -25],
      shadowSize: [30, 30]
    });

    this.centerMapOnCurrentLocation(customIcon).then(() => {
      this.startTracking(customIcon);
    });
  }

  markLastPointAsDestination(icon: L.Icon) {
    this.stopTracking(); // Detiene el seguimiento

    const lastPoint = this.coords[this.coords.length - 1];
    if (lastPoint) {
      const marker = L.marker(lastPoint, { icon })
        .addTo(this.map)
        .bindPopup('Destino');
      marker.on('click', () => {
        marker.openPopup();
      });
    }
  }

  ngOnDestroy() {
    this.stopTracking();
    if (this.map) {
      this.map.remove();
    }
  }
}

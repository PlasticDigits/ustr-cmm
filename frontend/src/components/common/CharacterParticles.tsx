import { useEffect, useRef } from 'react';

interface CharacterParticle {
  char: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  fadeDirection: number; // 1 for fading in, -1 for fading out
  color: string; // Fixed color for each particle
  fontWeight: number; // Font weight for variety
}

interface CharacterParticlesProps {
  className?: string;
}

const COLORS = ['#f59e0b', '#d97706', '#fbbf24', '#ffffff', '#92400e'];
const MIN_SIZE = 16;
const MAX_SIZE = 72;
const MIN_OPACITY = 0.03;
const MAX_OPACITY = 0.12;
const PARTICLE_COUNT = 60;
const FADE_SPEED = 0.0015;
const MIN_SPEED = 0.15;
const MAX_SPEED = 0.6;
const FONT_WEIGHTS = [300, 400, 500, 600];

export function CharacterParticles({ className = '' }: CharacterParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<CharacterParticle[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle retina displays
    const dpr = window.devicePixelRatio || 1;
    
    // Generate A-Z characters
    const characters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    
    let canvasWidth = 0;
    let canvasHeight = 0;
    
    // Initialize particles
    const initParticles = () => {
      particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
        const char = characters[Math.floor(Math.random() * characters.length)];
        const size = MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE);
        // Larger characters move slower for depth effect
        const speedMultiplier = 1 - (size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE) * 0.5;
        return {
          char,
          x: Math.random() * canvasWidth,
          y: Math.random() * canvasHeight,
          size,
          opacity: MIN_OPACITY + Math.random() * (MAX_OPACITY - MIN_OPACITY),
          speedX: (Math.random() - 0.5) * (MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)) * speedMultiplier,
          speedY: (Math.random() - 0.5) * (MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)) * speedMultiplier,
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 0.3,
          fadeDirection: Math.random() > 0.5 ? 1 : -1,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          fontWeight: FONT_WEIGHTS[Math.floor(Math.random() * FONT_WEIGHTS.length)],
        };
      });
    };

    // Set canvas size to full window
    const resizeCanvas = () => {
      canvasWidth = window.innerWidth;
      canvasHeight = window.innerHeight;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Reinitialize particles on resize
      if (particlesRef.current.length > 0) {
        initParticles();
      }
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    initParticles();

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      particlesRef.current.forEach((particle) => {
        // Update position
        particle.x += particle.speedX;
        particle.y += particle.speedY;

        // Wrap around edges
        if (particle.x < 0) particle.x = canvasWidth;
        if (particle.x > canvasWidth) particle.x = 0;
        if (particle.y < 0) particle.y = canvasHeight;
        if (particle.y > canvasHeight) particle.y = 0;

        // Update rotation
        particle.rotation += particle.rotationSpeed;

        // Update opacity (fade in/out)
        particle.opacity += particle.fadeDirection * FADE_SPEED;
        if (particle.opacity <= MIN_OPACITY) {
          particle.opacity = MIN_OPACITY;
          particle.fadeDirection = 1;
          // Randomly change character when fading in
          particle.char = characters[Math.floor(Math.random() * characters.length)];
        } else if (particle.opacity >= MAX_OPACITY) {
          particle.opacity = MAX_OPACITY;
          particle.fadeDirection = -1;
        }

        // Draw particle
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate((particle.rotation * Math.PI) / 180);
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;
        ctx.font = `${particle.fontWeight} ${particle.size}px 'Outfit', system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(particle.char, 0, 0);
        ctx.restore();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed top-0 left-0 w-screen h-screen pointer-events-none ${className}`}
      style={{ background: 'transparent', zIndex: 0 }}
    />
  );
}

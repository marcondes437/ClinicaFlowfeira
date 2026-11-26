import type { Metadata } from 'next';
import Presentation from './presentation';

export const metadata: Metadata = { title: 'ClínicaFlow · Apresentação para a feira', robots: { index: false, follow: false } };

export default function PresentationPage() { return <Presentation />; }

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { generarPaleta, PRESETS_TEMA, type TemaPersonalizado } from '@gestion/core';
import { GaleriaPresetsTema } from './GaleriaPresetsTema';

afterEach(cleanup);

const PRESET_MIEL = PRESETS_TEMA.find((p) => p.id === 'miel');
if (!PRESET_MIEL) throw new Error('fixture: falta el preset "miel"');

describe('GaleriaPresetsTema', () => {
  it('renderiza los 6 presets como role="radio" dentro de un radiogroup', () => {
    render(<GaleriaPresetsTema temaActivo={null} modo="light" onElegir={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Preset de colores' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(PRESETS_TEMA.length);
    for (const preset of PRESETS_TEMA) {
      expect(screen.getByRole('radio', { name: new RegExp(preset.nombre) })).toBeInTheDocument();
    }
  });

  it('cada card muestra 4 swatches con los colores REALES del motor (fondo, superficie, primary-600, primary-300)', () => {
    render(<GaleriaPresetsTema temaActivo={null} modo="dark" onElegir={vi.fn()} />);

    const tokensMiel = generarPaleta(PRESET_MIEL.tema);
    const cardMiel = screen.getByRole('radio', { name: new RegExp(PRESET_MIEL.nombre) });
    // Los swatches son <span aria-hidden>, sin role: se buscan por selector directo.
    const swatchEls = cardMiel.querySelectorAll('span[aria-hidden="true"]');
    expect(swatchEls).toHaveLength(4);
    expect((swatchEls[0] as HTMLElement).style.backgroundColor).toBe(tokensMiel.variables['--fondo-dark']);
    expect((swatchEls[1] as HTMLElement).style.backgroundColor).toBe(tokensMiel.variables['--superficie-dark']);
    expect((swatchEls[2] as HTMLElement).style.backgroundColor).toBe(tokensMiel.variables['--color-primary-600']);
    expect((swatchEls[3] as HTMLElement).style.backgroundColor).toBe(tokensMiel.variables['--color-primary-300']);
  });

  it('marca aria-checked=true en la card cuyo (matiz,tinte) coincide EXACTAMENTE con temaActivo', () => {
    render(<GaleriaPresetsTema temaActivo={PRESET_MIEL.tema} modo="light" onElegir={vi.fn()} />);

    const cardMiel = screen.getByRole('radio', { name: new RegExp(PRESET_MIEL.nombre) });
    expect(cardMiel.getAttribute('aria-checked')).toBe('true');

    for (const preset of PRESETS_TEMA) {
      if (preset.id === PRESET_MIEL.id) continue;
      expect(screen.getByRole('radio', { name: new RegExp(preset.nombre) }).getAttribute('aria-checked')).toBe(
        'false',
      );
    }
  });

  it('con temaActivo que no coincide con ningún preset, ninguna card queda marcada y aparece el chip "Personalizado"', () => {
    const temaCustom: TemaPersonalizado = { version: 1, matiz: 17, tinte: 'neutro' };
    render(<GaleriaPresetsTema temaActivo={temaCustom} modo="light" onElegir={vi.fn()} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
    expect(screen.getByText('Personalizado')).toBeInTheDocument();
  });

  it('sin temaActivo (null), no hay card marcada ni chip "Personalizado"', () => {
    render(<GaleriaPresetsTema temaActivo={null} modo="light" onElegir={vi.fn()} />);

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
    expect(screen.queryByText('Personalizado')).not.toBeInTheDocument();
  });

  it('tocar una card llama a onElegir con el tema exacto del preset', () => {
    const onElegir = vi.fn();
    render(<GaleriaPresetsTema temaActivo={null} modo="light" onElegir={onElegir} />);

    screen.getByRole('radio', { name: new RegExp(PRESET_MIEL.nombre) }).click();

    expect(onElegir).toHaveBeenCalledWith(PRESET_MIEL.tema);
  });
});

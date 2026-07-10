import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { itemsSelectorStock, SelectorSeccion } from './SelectorSeccion';

afterEach(cleanup);

describe('itemsSelectorStock', () => {
  it('vendedor: solo Stock y Catálogo', () => {
    const items = itemsSelectorStock(false);
    expect(items.map((i) => i.etiqueta)).toEqual(['Stock', 'Catálogo']);
  });

  it('admin: suma Proveedores', () => {
    const items = itemsSelectorStock(true);
    expect(items.map((i) => i.etiqueta)).toEqual(['Stock', 'Catálogo', 'Proveedores']);
  });
});

function renderizar(pathname: string, esAdmin = true) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SelectorSeccion items={itemsSelectorStock(esAdmin)} />
    </MemoryRouter>,
  );
}

describe('SelectorSeccion', () => {
  it('es un <nav> con aria-label "Secciones de Stock" (navegación, no ARIA tabs)', () => {
    renderizar('/stock');

    const nav = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(nav).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renderiza cada ítem como link real a su ruta', () => {
    renderizar('/stock');

    expect(screen.getByRole('link', { name: 'Stock' }).getAttribute('href')).toBe('/stock');
    expect(screen.getByRole('link', { name: 'Catálogo' }).getAttribute('href')).toBe('/stock/productos');
    expect(screen.getByRole('link', { name: 'Proveedores' }).getAttribute('href')).toBe('/stock/proveedores');
  });

  it('marca aria-current="page" SOLO en el ítem cuya ruta coincide EXACTO con el pathname actual', () => {
    renderizar('/stock/productos');

    const nav = within(screen.getByRole('navigation', { name: 'Secciones de Stock' }));
    expect(nav.getByRole('link', { name: 'Catálogo' }).getAttribute('aria-current')).toBe('page');
    // /stock es prefijo de /stock/productos: NO debe quedar marcado activo
    // (por eso el componente compara pathname exacto, no usa NavLink).
    expect(nav.getByRole('link', { name: 'Stock' }).getAttribute('aria-current')).toBeNull();
    expect(nav.getByRole('link', { name: 'Proveedores' }).getAttribute('aria-current')).toBeNull();
  });

  it('en la raíz /stock, el ítem activo es "Stock" y no "Catálogo"', () => {
    renderizar('/stock');

    const nav = within(screen.getByRole('navigation', { name: 'Secciones de Stock' }));
    expect(nav.getByRole('link', { name: 'Stock' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Catálogo' }).getAttribute('aria-current')).toBeNull();
  });

  it('vendedor: no ve el ítem "Proveedores"', () => {
    renderizar('/stock', false);

    expect(screen.queryByRole('link', { name: 'Proveedores' })).toBeNull();
  });

  it('tocar un ítem navega a su ruta real (rutas hermanas, no estado interno)', () => {
    function Placeholder({ nombre }: { nombre: string }) {
      return <div>Pantalla {nombre}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/stock']}>
        <Routes>
          <Route
            path="/stock"
            element={
              <>
                <SelectorSeccion items={itemsSelectorStock(true)} />
                <Placeholder nombre="Stock" />
              </>
            }
          />
          <Route
            path="/stock/productos"
            element={
              <>
                <SelectorSeccion items={itemsSelectorStock(true)} />
                <Placeholder nombre="Catálogo" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }));

    expect(screen.getByText('Pantalla Catálogo')).toBeTruthy();
    expect(screen.queryByText('Pantalla Stock')).toBeNull();
    expect(screen.getByRole('link', { name: 'Catálogo' }).getAttribute('aria-current')).toBe('page');
  });
});

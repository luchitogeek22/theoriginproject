# Validación del movimiento: predicción frente a medición

Generado el 2026-11-12 con datos reales de SPHEREx (IRSA) mediante `backend/scripts/validate_motion.py`. El desplazamiento previsto sale del movimiento propio de SIMBAD; el medido, de comparar la posición del objetivo en el apilado de la mitad temprana de las visitas con la de la mitad tardía, en el detector D6.

| Objetivo | Mov. propio (″/año) | Detector | Visitas | Línea base (días) | Previsto (″) | Medido (″) | Estado |
|---|---|---|---|---|---|---|---|
| Barnard's Star | 10.39 | D6 | 12 | 255 | E -0.6 / N +7.2 | E -0.6 / N +5.4 ± 1.8 | compatible (dif. 1.8″ = 0.30 px) |
| Epsilon Indi B | 4.68 | D6 | 12 | 431 | E +4.7 / N -2.9 | E +3.6 / N -2.7 ± 1.8 | compatible (dif. 1.1″ = 0.17 px) |
| WISE 0855 | 8.15 | D6 | 12 | 194 | E -4.3 / N +0.4 | E -4.7 / N +0.4 ± 2.0 | compatible (dif. 0.4″ = 0.07 px) |
| RW Aurigae | 0.02 | - | - | - | - | - | no aplica: movimiento previsto muy inferior a un píxel; se estudia por brillo |
| R Draconis | 0.02 | - | - | - | - | - | no aplica: movimiento previsto muy inferior a un píxel; se estudia por brillo |

Lectura: la incertidumbre combina el error estadístico del centroide con un piso sistemático de 0,3 px (1,85″) por el centroide en una PSF submuestreada, la alineación entre exposiciones y el paralaje (hasta ~0,55″ en Barnard). "Compatible" significa diferencia menor que dos veces esa incertidumbre. "No medible" significa que el objeto es demasiado débil para localizarlo en cada mitad. Un píxel de SPHEREx son 6,15″, de modo que la comparación solo resuelve diferencias mayores de ~0,3 px.

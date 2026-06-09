namespace Base_MVC_Core9.Helpers.ValidarRutNacional;

public static class RutValidator
{
    public static bool Validar(string? rut)
    {
        if (string.IsNullOrWhiteSpace(rut)) return false;

        string valorLimpio = rut.Replace(".", "").Replace("-", "").ToUpper().Trim();
        if (valorLimpio.Length < 2) return false;

        string cuerpo = valorLimpio[..^1];
        string dvEntregado = valorLimpio[^1..];

        if (!int.TryParse(cuerpo, out _)) return false;

        return dvEntregado == CalcularDV(cuerpo);
    }

    public static string CalcularDV(string cuerpo)
    {
        // 1. Limpieza absoluta: solo números
        string cuerpoLimpio = new string(cuerpo.Where(char.IsDigit).ToArray());

        int suma = 0;
        int multiplo = 2;

        // 2. Recorrido de derecha a izquierda
        for (int i = cuerpoLimpio.Length - 1; i >= 0; i--)
        {
            suma += (cuerpoLimpio[i] - '0') * multiplo;
            multiplo = (multiplo == 7) ? 2 : multiplo + 1;
        }

        // 3. Cálculo del dígito
        int resto = suma % 11;
        int dv = 11 - resto;

        if (dv == 11) return "0";
        if (dv == 10) return "K";
        return dv.ToString();
    }
}
using System.Globalization;
using System.Text.RegularExpressions;

namespace KaizenEvents.Shared.Helpers;

public class FormulaException : Exception
{
    public FormulaException(string message) : base(message) { }
}

/// <summary>
/// AST-based secure expression evaluator — no eval().
/// Supports: + - * / // % ** (operators), == != &lt; &lt;= > >= (comparisons),
/// unary -/+, if(cond,t,f), and functions: sum avg min max abs round ceil floor sqrt pow.
/// Field references ${field_id} and named variables are substituted before parsing.
/// Safety: max formula length 1000, max AST depth 20, division by zero returns 0.
/// </summary>
public static class FormulaEngine
{
    private const int MaxLength = 1000;
    private const int MaxDepth  = 20;

    private static readonly Dictionary<string, Func<double[], double>> Functions =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["sum"]   = a => a.Length == 0 ? 0 : a.Sum(),
            ["avg"]   = a => a.Length == 0 ? 0 : a.Average(),
            ["min"]   = a => a.Min(),
            ["max"]   = a => a.Max(),
            ["abs"]   = a => Math.Abs(a[0]),
            ["round"] = a => a.Length > 1
                ? Math.Round(a[0], (int)a[1], MidpointRounding.AwayFromZero)
                : Math.Round(a[0], MidpointRounding.AwayFromZero),
            ["ceil"]  = a => Math.Ceiling(a[0]),
            ["floor"] = a => Math.Floor(a[0]),
            ["sqrt"]  = a => Math.Sqrt(a[0]),
            ["pow"]   = a => Math.Pow(a[0], a[1]),
        };

    // ── Public API ────────────────────────────────────────────────────────────

    public static (bool Valid, string? Error) Validate(string formula)
    {
        try
        {
            // Substitute field refs with 1 so the expression can be parsed
            var expr = Regex.Replace(formula, @"\$\{[^}]+\}", "1");
            ParseAndEval(expr, []);
            return (true, null);
        }
        catch (FormulaException ex) { return (false, ex.Message); }
        catch (Exception ex)        { return (false, ex.Message); }
    }

    public static double Evaluate(string formula, Dictionary<string, double> variables)
        => ParseAndEval(formula, variables);

    // ── Core pipeline ─────────────────────────────────────────────────────────

    private static double ParseAndEval(string formula, Dictionary<string, double> vars)
    {
        if (formula.Length > MaxLength)
            throw new FormulaException($"Formula exceeds max length of {MaxLength}.");

        var expr = SubstituteVars(formula, vars);
        var ctx  = new ParseCtx(Tokenize(expr));
        var ast  = ParseComparison(ctx, 0);

        if (!ctx.AtEnd)
            throw new FormulaException($"Unexpected token '{ctx.Current.Text}'.");

        return EvalNode(ast, 0);
    }

    private static string SubstituteVars(string formula, Dictionary<string, double> vars)
    {
        // Replace ${field_id} references
        var result = Regex.Replace(formula, @"\$\{([^}]+)\}", m =>
            vars.TryGetValue(m.Groups[1].Value, out var v)
                ? v.ToString("G17", CultureInfo.InvariantCulture)
                : "0");

        // Replace named variables (whole-word match)
        foreach (var kv in vars)
            result = Regex.Replace(result,
                $@"\b{Regex.Escape(kv.Key)}\b",
                kv.Value.ToString("G17", CultureInfo.InvariantCulture));

        return result;
    }

    // ── Tokenizer ─────────────────────────────────────────────────────────────

    private enum TK { Num, Ident, Plus, Minus, Mul, Div, FDiv, Mod, Pow, Eq, Neq, Lt, Lte, Gt, Gte, LP, RP, Comma, Eof }

    private record Tok(TK Kind, string Text, double Num = 0);

    private static List<Tok> Tokenize(string input)
    {
        var toks = new List<Tok>();
        int i = 0;

        while (i < input.Length)
        {
            var c = input[i];
            if (char.IsWhiteSpace(c)) { i++; continue; }

            // Number
            if (char.IsDigit(c) || (c == '.' && i + 1 < input.Length && char.IsDigit(input[i + 1])))
            {
                int start = i;
                while (i < input.Length && (char.IsDigit(input[i]) || input[i] == '.'))
                    i++;
                if (i < input.Length && (input[i] is 'e' or 'E'))
                {
                    i++;
                    if (i < input.Length && input[i] is '+' or '-') i++;
                    while (i < input.Length && char.IsDigit(input[i])) i++;
                }
                var text = input[start..i];
                if (!double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var val))
                    throw new FormulaException($"Invalid number: '{text}'.");
                toks.Add(new Tok(TK.Num, text, val));
                continue;
            }

            // Identifier / keyword
            if (char.IsLetter(c) || c == '_')
            {
                int start = i;
                while (i < input.Length && (char.IsLetterOrDigit(input[i]) || input[i] == '_'))
                    i++;
                toks.Add(new Tok(TK.Ident, input[start..i]));
                continue;
            }

            // Multi-char operators
            if (i + 1 < input.Length)
            {
                var two = input[i..(i + 2)];
                TK? kind = two switch
                {
                    "**" => TK.Pow,  "//" => TK.FDiv,
                    "==" => TK.Eq,   "!=" => TK.Neq,
                    "<=" => TK.Lte,  ">=" => TK.Gte,
                    _ => null
                };
                if (kind.HasValue) { toks.Add(new Tok(kind.Value, two)); i += 2; continue; }
            }

            TK single = c switch
            {
                '+' => TK.Plus,  '-' => TK.Minus, '*' => TK.Mul,
                '/' => TK.Div,   '%' => TK.Mod,   '<' => TK.Lt,
                '>' => TK.Gt,    '(' => TK.LP,    ')' => TK.RP,
                ',' => TK.Comma,
                _ => throw new FormulaException($"Unexpected character '{c}'.")
            };
            toks.Add(new Tok(single, c.ToString()));
            i++;
        }

        toks.Add(new Tok(TK.Eof, ""));
        return toks;
    }

    // ── Parser ────────────────────────────────────────────────────────────────

    private class ParseCtx
    {
        private readonly List<Tok> _toks;
        private int _pos;
        public ParseCtx(List<Tok> toks) => _toks = toks;
        public Tok Current  => _pos < _toks.Count ? _toks[_pos] : new Tok(TK.Eof, "");
        public bool AtEnd   => Current.Kind == TK.Eof;
        public Tok Consume() { var t = Current; _pos++; return t; }
        public Tok Expect(TK k) => Current.Kind == k
            ? Consume()
            : throw new FormulaException($"Expected '{k}' but got '{Current.Text}'.");
        public bool TryConsume(TK k) { if (Current.Kind != k) return false; _pos++; return true; }
    }

    // AST
    private abstract record Node;
    private record Num(double V)                               : Node;
    private record BinOp(string Op, Node L, Node R)           : Node;
    private record Unary(string Op, Node Operand)             : Node;
    private record Func(string Name, Node[] Args)             : Node;
    private record If(Node Cond, Node Then, Node Else)        : Node;

    private static void DepthGuard(int d)
    {
        if (d > MaxDepth) throw new FormulaException($"Formula too complex (max depth {MaxDepth}).");
    }

    private static Node ParseComparison(ParseCtx ctx, int d)
    {
        DepthGuard(d);
        var left = ParseSum(ctx, d + 1);
        string? op = ctx.Current.Kind switch
        {
            TK.Eq  => "==", TK.Neq => "!=",
            TK.Lt  => "<",  TK.Lte => "<=",
            TK.Gt  => ">",  TK.Gte => ">=",
            _      => null
        };
        if (op == null) return left;
        ctx.Consume();
        return new BinOp(op, left, ParseSum(ctx, d + 1));
    }

    private static Node ParseSum(ParseCtx ctx, int d)
    {
        DepthGuard(d);
        var left = ParseTerm(ctx, d + 1);
        while (ctx.Current.Kind is TK.Plus or TK.Minus)
        {
            var op = ctx.Consume().Text;
            left = new BinOp(op, left, ParseTerm(ctx, d + 1));
        }
        return left;
    }

    private static Node ParseTerm(ParseCtx ctx, int d)
    {
        DepthGuard(d);
        var left = ParsePower(ctx, d + 1);
        while (ctx.Current.Kind is TK.Mul or TK.Div or TK.FDiv or TK.Mod)
        {
            var op = ctx.Consume().Text;
            left = new BinOp(op, left, ParsePower(ctx, d + 1));
        }
        return left;
    }

    private static Node ParsePower(ParseCtx ctx, int d)
    {
        DepthGuard(d);
        var left = ParseUnary(ctx, d + 1);
        if (ctx.Current.Kind == TK.Pow)
        {
            ctx.Consume();
            return new BinOp("**", left, ParsePower(ctx, d + 1)); // right-assoc
        }
        return left;
    }

    private static Node ParseUnary(ParseCtx ctx, int d)
    {
        DepthGuard(d);
        if (ctx.TryConsume(TK.Minus)) return new Unary("-", ParseUnary(ctx, d + 1));
        if (ctx.TryConsume(TK.Plus))  return ParseUnary(ctx, d + 1);
        return ParsePrimary(ctx, d + 1);
    }

    private static Node ParsePrimary(ParseCtx ctx, int d)
    {
        DepthGuard(d);

        if (ctx.Current.Kind == TK.Num)
            return new Num(ctx.Consume().Num);

        if (ctx.TryConsume(TK.LP))
        {
            var expr = ParseComparison(ctx, d + 1);
            ctx.Expect(TK.RP);
            return expr;
        }

        if (ctx.Current.Kind == TK.Ident)
        {
            var name = ctx.Consume().Text;

            if (ctx.TryConsume(TK.LP))
            {
                // if(cond, then, else)
                if (name.Equals("if", StringComparison.OrdinalIgnoreCase))
                {
                    var cond = ParseComparison(ctx, d + 1);
                    ctx.Expect(TK.Comma);
                    var then = ParseSum(ctx, d + 1);
                    ctx.Expect(TK.Comma);
                    var els  = ParseSum(ctx, d + 1);
                    ctx.Expect(TK.RP);
                    return new If(cond, then, els);
                }

                if (!Functions.ContainsKey(name))
                    throw new FormulaException($"Unknown function '{name}'.");

                var args = new List<Node>();
                if (ctx.Current.Kind != TK.RP)
                {
                    args.Add(ParseSum(ctx, d + 1));
                    while (ctx.TryConsume(TK.Comma))
                        args.Add(ParseSum(ctx, d + 1));
                }
                ctx.Expect(TK.RP);
                return new Func(name, [.. args]);
            }

            // Unknown identifier after substitution — treat as 0
            return new Num(0);
        }

        throw new FormulaException($"Unexpected token '{ctx.Current.Text}'.");
    }

    // ── Evaluator ─────────────────────────────────────────────────────────────

    private static double EvalNode(Node n, int d)
    {
        if (d > MaxDepth) throw new FormulaException("Evaluation depth exceeded.");

        return n switch
        {
            Num num       => num.V,
            Unary u       => u.Op == "-" ? -EvalNode(u.Operand, d + 1) : EvalNode(u.Operand, d + 1),
            If ifn        => EvalNode(ifn.Cond, d + 1) != 0
                                 ? EvalNode(ifn.Then, d + 1)
                                 : EvalNode(ifn.Else, d + 1),
            Func fn       => EvalFunc(fn, d),
            BinOp bin     => EvalBin(bin, d),
            _ => throw new FormulaException("Unknown node type.")
        };
    }

    private static double EvalFunc(Func fn, int d)
    {
        if (!Functions.TryGetValue(fn.Name, out var f))
            throw new FormulaException($"Unknown function '{fn.Name}'.");
        return f(fn.Args.Select(a => EvalNode(a, d + 1)).ToArray());
    }

    private static double EvalBin(BinOp b, int d)
    {
        var l = EvalNode(b.L, d + 1);
        var r = EvalNode(b.R, d + 1);
        return b.Op switch
        {
            "+"  => l + r,
            "-"  => l - r,
            "*"  => l * r,
            "/"  => r == 0 ? 0 : l / r,
            "//" => r == 0 ? 0 : Math.Truncate(l / r),
            "%"  => r == 0 ? 0 : l % r,
            "**" => Math.Pow(l, r),
            "==" => l == r ? 1 : 0,
            "!=" => l != r ? 1 : 0,
            "<"  => l <  r ? 1 : 0,
            "<=" => l <= r ? 1 : 0,
            ">"  => l >  r ? 1 : 0,
            ">=" => l >= r ? 1 : 0,
            _    => throw new FormulaException($"Unknown operator '{b.Op}'.")
        };
    }
}

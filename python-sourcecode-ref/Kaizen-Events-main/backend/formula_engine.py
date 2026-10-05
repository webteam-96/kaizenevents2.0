"""
Secure Formula Engine for calculating prices, validations, and conditional logic.
Uses a safe expression parser instead of eval() to prevent code injection attacks.
"""
import re
import ast
import operator
from typing import Dict, Any, List, Union
import math


class SecureExpressionParser:
    """
    A secure expression parser that only allows safe mathematical operations.
    No arbitrary code execution is possible.
    """
    
    # Allowed operators
    OPERATORS = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }
    
    # Allowed comparison operators
    COMPARISONS = {
        ast.Eq: operator.eq,
        ast.NotEq: operator.ne,
        ast.Lt: operator.lt,
        ast.LtE: operator.le,
        ast.Gt: operator.gt,
        ast.GtE: operator.ge,
    }
    
    # Safe built-in functions
    SAFE_FUNCTIONS = {
        'sum': lambda *args: sum(args),
        'avg': lambda *args: sum(args) / len(args) if args else 0,
        'min': lambda *args: min(args) if args else 0,
        'max': lambda *args: max(args) if args else 0,
        'abs': abs,
        'round': round,
        'ceil': math.ceil,
        'floor': math.floor,
        'sqrt': lambda x: math.sqrt(x) if x >= 0 else 0,
        'pow': pow,
    }
    
    # Maximum expression length to prevent DoS
    MAX_EXPRESSION_LENGTH = 1000
    
    # Maximum recursion depth
    MAX_DEPTH = 20
    
    def __init__(self):
        self._depth = 0
    
    def evaluate(self, expression: str) -> Union[float, int, bool]:
        """
        Safely evaluate a mathematical expression.
        
        Args:
            expression: A string containing a mathematical expression
            
        Returns:
            The result of the expression
            
        Raises:
            ValueError: If the expression is invalid or contains unsafe operations
        """
        # Security check: limit expression length
        if len(expression) > self.MAX_EXPRESSION_LENGTH:
            raise ValueError(f"Expression too long (max {self.MAX_EXPRESSION_LENGTH} characters)")
        
        # Security check: only allow safe characters
        if not self._is_safe_expression(expression):
            raise ValueError("Expression contains unsafe characters")
        
        try:
            # Parse the expression into an AST
            tree = ast.parse(expression, mode='eval')
            
            # Reset depth counter
            self._depth = 0
            
            # Evaluate the AST safely
            return self._eval_node(tree.body)
            
        except SyntaxError as e:
            raise ValueError(f"Invalid expression syntax: {e}")
        except Exception as e:
            raise ValueError(f"Expression evaluation error: {e}")
    
    def _is_safe_expression(self, expression: str) -> bool:
        """Check if expression contains only safe characters."""
        # Allow: digits, operators, parentheses, commas, dots, spaces, and function names
        safe_pattern = r'^[\d\s\+\-\*\/\%\^\(\)\,\.\<\>\=\!a-zA-Z_]+$'
        return bool(re.match(safe_pattern, expression))
    
    def _eval_node(self, node: ast.AST) -> Union[float, int, bool]:
        """Recursively evaluate an AST node."""
        self._depth += 1
        
        if self._depth > self.MAX_DEPTH:
            raise ValueError("Expression too complex (max depth exceeded)")
        
        try:
            if isinstance(node, ast.Constant):
                # Python 3.8+ uses ast.Constant
                if isinstance(node.value, (int, float)):
                    return node.value
                raise ValueError(f"Unsupported constant type: {type(node.value)}")
            
            elif isinstance(node, ast.Num):
                # Python 3.7 compatibility
                return node.n
            
            elif isinstance(node, ast.BinOp):
                # Binary operations: +, -, *, /, etc.
                op_type = type(node.op)
                if op_type not in self.OPERATORS:
                    raise ValueError(f"Unsupported operator: {op_type.__name__}")
                
                left = self._eval_node(node.left)
                right = self._eval_node(node.right)
                
                # Prevent division by zero
                if op_type in (ast.Div, ast.FloorDiv, ast.Mod) and right == 0:
                    return 0
                
                return self.OPERATORS[op_type](left, right)
            
            elif isinstance(node, ast.UnaryOp):
                # Unary operations: -x, +x
                op_type = type(node.op)
                if op_type not in self.OPERATORS:
                    raise ValueError(f"Unsupported unary operator: {op_type.__name__}")
                
                operand = self._eval_node(node.operand)
                return self.OPERATORS[op_type](operand)
            
            elif isinstance(node, ast.Compare):
                # Comparison operations: <, >, ==, etc.
                left = self._eval_node(node.left)
                
                for op, comparator in zip(node.ops, node.comparators):
                    op_type = type(op)
                    if op_type not in self.COMPARISONS:
                        raise ValueError(f"Unsupported comparison: {op_type.__name__}")
                    
                    right = self._eval_node(comparator)
                    if not self.COMPARISONS[op_type](left, right):
                        return False
                    left = right
                
                return True
            
            elif isinstance(node, ast.Call):
                # Function calls - only allow safe functions
                if not isinstance(node.func, ast.Name):
                    raise ValueError("Only simple function calls are allowed")
                
                func_name = node.func.id.lower()
                
                if func_name not in self.SAFE_FUNCTIONS:
                    raise ValueError(f"Unsupported function: {func_name}")
                
                # Evaluate arguments
                args = [self._eval_node(arg) for arg in node.args]
                
                return self.SAFE_FUNCTIONS[func_name](*args)
            
            elif isinstance(node, ast.IfExp):
                # Ternary expression: x if condition else y
                test = self._eval_node(node.test)
                if test:
                    return self._eval_node(node.body)
                else:
                    return self._eval_node(node.orelse)
            
            elif isinstance(node, ast.Name):
                # Variable names are not allowed (all variables should be substituted)
                raise ValueError(f"Unknown variable: {node.id}")
            
            else:
                raise ValueError(f"Unsupported expression type: {type(node).__name__}")
                
        finally:
            self._depth -= 1


class FormulaEngine:
    """
    Formula engine for calculating prices, validations, and conditional logic.
    Uses SecureExpressionParser for safe evaluation - NO eval() used.
    
    Supports: +, -, *, /, %, ^, (), field references, functions (sum, avg, min, max, etc.)
    """
    
    # Allowed function names for the if() syntax conversion
    IF_FUNCTION_PATTERN = re.compile(
        r'\bif\s*\(\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^)]+)\s*\)',
        re.IGNORECASE
    )
    
    @staticmethod
    def parse_formula(formula: str, field_values: Dict[str, Any]) -> float:
        """
        Parse and evaluate a formula securely.
        
        Examples:
        - "${field_1} * ${field_2} + 100"
        - "if(${field_1} > 1000, ${field_1} * 0.9, ${field_1})"
        - "sum(${field_1}, ${field_2}, ${field_3})"
        
        Args:
            formula: The formula string with ${field_id} placeholders
            field_values: Dictionary mapping field IDs to their values
            
        Returns:
            The calculated result as a float
        """
        try:
            # Validate formula length
            if len(formula) > 1000:
                raise ValueError("Formula too long")
            
            # Replace field references with actual values
            parsed = formula
            
            # Find all field references ${field_id}
            field_refs = re.findall(r'\$\{([^}]+)\}', formula)
            
            for field_ref in field_refs:
                field_value = field_values.get(field_ref, 0)
                
                # Convert to number safely
                numeric_value = FormulaEngine._to_number(field_value)
                parsed = parsed.replace(f'${{{field_ref}}}', str(numeric_value))
            
            # Convert if() function syntax to Python ternary
            # if(condition, true_val, false_val) -> (true_val if condition else false_val)
            parsed = FormulaEngine._convert_if_syntax(parsed)
            
            # Use secure parser instead of eval
            parser = SecureExpressionParser()
            result = parser.evaluate(parsed)
            
            return float(result)
        
        except Exception as e:
            raise ValueError(f"Formula evaluation error: {str(e)}")
    
    @staticmethod
    def _to_number(value: Any) -> float:
        """Safely convert a value to a number."""
        if value is None:
            return 0.0
        if isinstance(value, bool):
            return 1.0 if value else 0.0
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            try:
                return float(value)
            except (ValueError, TypeError):
                return 0.0
        return 0.0
    
    @staticmethod
    def _convert_if_syntax(expression: str) -> str:
        """
        Convert if(condition, true_val, false_val) to Python ternary syntax.
        """
        def replace_if(match):
            condition = match.group(1).strip()
            true_val = match.group(2).strip()
            false_val = match.group(3).strip()
            return f"({true_val} if {condition} else {false_val})"
        
        # Repeatedly replace if() calls (handles nested calls)
        max_iterations = 10
        for _ in range(max_iterations):
            new_expression = FormulaEngine.IF_FUNCTION_PATTERN.sub(replace_if, expression)
            if new_expression == expression:
                break
            expression = new_expression
        
        return expression
    
    @staticmethod
    def validate_formula(formula: str, available_fields: List[str]) -> Dict[str, Any]:
        """
        Validate a formula syntax and field references.
        
        Args:
            formula: The formula to validate
            available_fields: List of available field IDs
            
        Returns:
            Dictionary with 'valid' boolean and error message or test result
        """
        try:
            # Check for field references
            field_refs = re.findall(r'\$\{([^}]+)\}', formula)
            
            # Add built-in fields that are always available
            all_available = list(available_fields) + ['base_price', 'current_total']
            
            # Check if all referenced fields exist
            invalid_fields = [f for f in field_refs if f not in all_available]
            
            if invalid_fields:
                return {
                    "valid": False,
                    "error": f"Invalid field references: {', '.join(invalid_fields)}"
                }
            
            # Test parse with dummy values
            test_values = {field: 1 for field in all_available}
            result = FormulaEngine.parse_formula(formula, test_values)
            
            return {
                "valid": True,
                "test_result": result,
                "fields_used": field_refs
            }
        
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }
    
    @staticmethod
    def evaluate_condition(condition: Dict[str, Any], field_values: Dict[str, Any]) -> bool:
        """
        Evaluate a conditional logic statement.
        
        Args:
            condition: Dictionary with field_id, operator, and value
            field_values: Dictionary of current field values
            
        Returns:
            Boolean result of the condition
        """
        field_id = condition.get("field_id")
        op = condition.get("operator")
        value = condition.get("value")
        
        field_value = field_values.get(field_id)
        
        # Handle different operators with explicit comparisons (no eval)
        if op == "equals":
            return field_value == value
        elif op == "not_equals":
            return field_value != value
        elif op == "contains":
            return str(value) in str(field_value) if field_value else False
        elif op == "not_contains":
            return str(value) not in str(field_value) if field_value else True
        elif op == "greater_than":
            try:
                return float(field_value) > float(value)
            except (ValueError, TypeError):
                return False
        elif op == "less_than":
            try:
                return float(field_value) < float(value)
            except (ValueError, TypeError):
                return False
        elif op == "greater_equal":
            try:
                return float(field_value) >= float(value)
            except (ValueError, TypeError):
                return False
        elif op == "less_equal":
            try:
                return float(field_value) <= float(value)
            except (ValueError, TypeError):
                return False
        elif op == "between":
            try:
                min_val, max_val = value
                return float(min_val) <= float(field_value) <= float(max_val)
            except (ValueError, TypeError):
                return False
        elif op == "is_empty":
            return not field_value or field_value == "" or field_value == []
        elif op == "is_not_empty":
            return bool(field_value) and field_value != "" and field_value != []
        elif op == "starts_with":
            return str(field_value).startswith(str(value)) if field_value else False
        elif op == "ends_with":
            return str(field_value).endswith(str(value)) if field_value else False
        
        return False
    
    @staticmethod
    def apply_pricing_rules(
        base_price: float,
        field_values: Dict[str, Any],
        pricing_rules: List[Dict[str, Any]],
        pricing_formula: str = None
    ) -> Dict[str, Any]:
        """
        Apply pricing rules and calculate final price.
        
        Args:
            base_price: The base price before rules
            field_values: Dictionary of field values
            pricing_rules: List of pricing rule configurations
            pricing_formula: Optional master pricing formula
            
        Returns:
            Dictionary with base_price, total_price, and applied_rules
        """
        total_price = base_price
        applied_rules = []
        
        # Apply individual pricing rules
        if pricing_rules:
            sorted_rules = sorted(pricing_rules, key=lambda x: x.get("priority", 0), reverse=True)
            
            for rule in sorted_rules:
                conditions = rule.get("conditions", [])
                
                # Check if all conditions are met
                if conditions:
                    conditions_met = all(
                        FormulaEngine.evaluate_condition(cond, field_values)
                        for cond in conditions
                    )
                    
                    if not conditions_met:
                        continue
                
                # Apply rule formula
                formula = rule.get("formula")
                if formula:
                    try:
                        rule_result = FormulaEngine.parse_formula(formula, field_values)
                        total_price += rule_result
                        applied_rules.append({
                            "rule_name": rule.get("name"),
                            "amount": rule_result
                        })
                    except Exception:
                        pass
        
        # Apply master pricing formula if exists
        if pricing_formula:
            try:
                # Add base_price to field values for formula
                formula_values = {**field_values, "base_price": base_price, "current_total": total_price}
                total_price = FormulaEngine.parse_formula(pricing_formula, formula_values)
            except Exception:
                pass
        
        return {
            "base_price": base_price,
            "total_price": round(total_price, 2),
            "applied_rules": applied_rules
        }
    
    @staticmethod
    def calculate_field_value(field: Dict[str, Any], field_values: Dict[str, Any]) -> Any:
        """
        Calculate value for calculated fields.
        
        Args:
            field: Field configuration with is_calculated and calculation_formula
            field_values: Dictionary of current field values
            
        Returns:
            The calculated value or 0 if calculation fails
        """
        if not field.get("is_calculated"):
            return field_values.get(field["id"])
        
        formula = field.get("calculation_formula")
        if not formula:
            return 0
        
        try:
            return FormulaEngine.parse_formula(formula, field_values)
        except Exception:
            return 0


# Create singleton instance
formula_engine = FormulaEngine()
